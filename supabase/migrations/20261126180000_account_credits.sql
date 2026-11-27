BEGIN;

CREATE TABLE public.credit_accounts (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance_seconds bigint NOT NULL DEFAULT 0 CHECK (balance_seconds >= 0)
);

CREATE TABLE public.credit_reservations (
    transcription_id uuid PRIMARY KEY REFERENCES public.transcriptions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.credit_accounts(user_id) ON DELETE CASCADE,
    seconds integer NOT NULL CHECK (seconds > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_reservations_user_idx ON public.credit_reservations(user_id);

CREATE TABLE public.credit_movements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.credit_accounts(user_id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('simulated', 'stripe_test', 'transcription')),
    reference text NOT NULL,
    seconds bigint NOT NULL,
    amount_cents integer NOT NULL DEFAULT 0,
    label text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, kind, reference),
    CHECK ((kind = 'transcription' AND seconds < 0 AND amount_cents = 0)
        OR (kind <> 'transcription' AND seconds > 0 AND amount_cents > 0))
);
CREATE UNIQUE INDEX credit_stripe_session_idx ON public.credit_movements(reference) WHERE kind = 'stripe_test';
CREATE INDEX credit_movements_user_idx ON public.credit_movements(user_id, id DESC);

ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_accounts, public.credit_reservations, public.credit_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.credit_movements_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_accounts, public.credit_reservations, public.credit_movements TO service_role;
GRANT USAGE ON SEQUENCE public.credit_movements_id_seq TO service_role;

CREATE FUNCTION public.credit_summary(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT jsonb_build_object(
        'balance_seconds', COALESCE((SELECT balance_seconds FROM public.credit_accounts WHERE user_id = p_user_id), 0),
        'reserved_seconds', COALESCE((SELECT SUM(seconds) FROM public.credit_reservations WHERE user_id = p_user_id), 0),
        'recharged_seconds', COALESCE(SUM(seconds) FILTER (WHERE seconds > 0), 0),
        'used_seconds', COALESCE(-SUM(seconds) FILTER (WHERE seconds < 0), 0)
    ) FROM public.credit_movements WHERE user_id = p_user_id;
$$;

CREATE FUNCTION public.top_up_test_credits(
    p_user_id uuid, p_kind text, p_reference text, p_seconds integer, p_amount_cents integer, p_label text
) RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF p_kind NOT IN ('simulated', 'stripe_test') THEN
        RAISE EXCEPTION 'Invalid test recharge source';
    END IF;

    INSERT INTO public.credit_accounts(user_id) VALUES (p_user_id)
    ON CONFLICT DO NOTHING;

    PERFORM 1 FROM public.credit_accounts WHERE user_id = p_user_id FOR UPDATE;
    INSERT INTO public.credit_movements(user_id, kind, reference, seconds, amount_cents, label)
    VALUES (p_user_id, p_kind, p_reference, p_seconds, p_amount_cents, p_label)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN false; END IF;

    UPDATE public.credit_accounts SET balance_seconds = balance_seconds + p_seconds
    WHERE user_id = p_user_id;
    RETURN true;
END;
$$;

CREATE FUNCTION public.reserve_transcription_credit(
    p_user_id uuid, p_filename text, p_language text, p_seconds integer
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_balance bigint;
    v_reserved bigint;
    v_id uuid;
BEGIN
    SELECT balance_seconds INTO v_balance FROM public.credit_accounts
    WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT COALESCE(SUM(seconds), 0) INTO v_reserved FROM public.credit_reservations WHERE user_id = p_user_id;
    IF v_balance - v_reserved < p_seconds THEN RETURN NULL; END IF;

    INSERT INTO public.transcriptions(user_id, filename, language, status)
    VALUES (p_user_id, p_filename, p_language, 'processing') RETURNING id INTO v_id;
    INSERT INTO public.credit_reservations(transcription_id, user_id, seconds)
    VALUES (v_id, p_user_id, p_seconds);
    RETURN v_id;
END;
$$;

-- The existing finish_transcription_job() inserts usage in the same transaction as the result.
CREATE FUNCTION public.consume_reserved_credit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_seconds integer;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.credit_reservations
                   WHERE transcription_id = NEW.transcription_id AND user_id = NEW.user_id) THEN
        RETURN NEW;
    END IF;
    PERFORM 1 FROM public.credit_accounts WHERE user_id = NEW.user_id FOR UPDATE;
    DELETE FROM public.credit_reservations
    WHERE transcription_id = NEW.transcription_id AND user_id = NEW.user_id
    RETURNING seconds INTO v_seconds;
    IF NOT FOUND THEN RETURN NEW; END IF;

    UPDATE public.credit_accounts SET balance_seconds = balance_seconds - v_seconds WHERE user_id = NEW.user_id;
    INSERT INTO public.credit_movements(user_id, kind, reference, seconds, label)
    SELECT NEW.user_id, 'transcription', NEW.transcription_id::text, -v_seconds, filename
    FROM public.transcriptions WHERE id = NEW.transcription_id;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.release_failed_credit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    DELETE FROM public.credit_reservations WHERE transcription_id = NEW.id;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.expire_unsubmitted_transcriptions() RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_id uuid;
BEGIN
    FOR v_id IN
        SELECT t.id FROM public.transcriptions t
        JOIN public.credit_reservations r ON r.transcription_id = t.id
        WHERE t.status = 'processing' AND r.created_at < now() - interval '2 hours'
          AND NOT EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.transcription_id = t.id)
        LIMIT 50 FOR UPDATE OF t SKIP LOCKED
    LOOP
        UPDATE public.transcriptions SET status = 'failed', error_message = 'The upload was interrupted'
        WHERE id = v_id
          AND NOT EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.transcription_id = v_id);
    END LOOP;
END;
$$;

CREATE TRIGGER consume_credit_after_usage AFTER INSERT ON public.usage_records
FOR EACH ROW EXECUTE FUNCTION public.consume_reserved_credit();
CREATE TRIGGER release_credit_after_failure AFTER UPDATE OF status ON public.transcriptions
FOR EACH ROW WHEN (NEW.status = 'failed' AND OLD.status <> 'failed')
EXECUTE FUNCTION public.release_failed_credit();

REVOKE ALL ON FUNCTION public.credit_summary(uuid),
    public.top_up_test_credits(uuid, text, text, integer, integer, text),
    public.reserve_transcription_credit(uuid, text, text, integer),
    public.expire_unsubmitted_transcriptions(), public.consume_reserved_credit(), public.release_failed_credit()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_summary(uuid),
    public.top_up_test_credits(uuid, text, text, integer, integer, text),
    public.reserve_transcription_credit(uuid, text, text, integer), public.expire_unsubmitted_transcriptions()
    TO service_role;

COMMIT;
