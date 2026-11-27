BEGIN;

-- All balances and in-flight reservations from phase 3 are test data.
ALTER TABLE public.credit_accounts ADD COLUMN wallet text NOT NULL DEFAULT 'test'
    CHECK (wallet IN ('test', 'live'));
ALTER TABLE public.credit_reservations ADD COLUMN wallet text NOT NULL DEFAULT 'test';
ALTER TABLE public.credit_movements ADD COLUMN wallet text NOT NULL DEFAULT 'test';

ALTER TABLE public.credit_reservations DROP CONSTRAINT credit_reservations_user_id_fkey;
ALTER TABLE public.credit_movements DROP CONSTRAINT credit_movements_user_id_fkey;
ALTER TABLE public.credit_accounts DROP CONSTRAINT credit_accounts_pkey;
ALTER TABLE public.credit_accounts ADD PRIMARY KEY (user_id, wallet);
ALTER TABLE public.credit_reservations ADD FOREIGN KEY (user_id, wallet)
    REFERENCES public.credit_accounts(user_id, wallet) ON DELETE CASCADE;
ALTER TABLE public.credit_movements ADD FOREIGN KEY (user_id, wallet)
    REFERENCES public.credit_accounts(user_id, wallet) ON DELETE CASCADE;
ALTER TABLE public.credit_movements ADD CHECK (wallet = 'test' OR kind = 'transcription');

DROP FUNCTION public.credit_summary(uuid);
DROP FUNCTION public.reserve_transcription_credit(uuid, text, text, integer);

CREATE FUNCTION public.credit_summary(p_user_id uuid, p_wallet text DEFAULT 'test') RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT jsonb_build_object(
        'balance_seconds', COALESCE((SELECT balance_seconds FROM public.credit_accounts WHERE user_id = p_user_id AND wallet = p_wallet), 0),
        'reserved_seconds', COALESCE((SELECT SUM(seconds) FROM public.credit_reservations WHERE user_id = p_user_id AND wallet = p_wallet), 0),
        'recharged_seconds', COALESCE(SUM(seconds) FILTER (WHERE seconds > 0), 0),
        'used_seconds', COALESCE(-SUM(seconds) FILTER (WHERE seconds < 0), 0)
    ) FROM public.credit_movements WHERE user_id = p_user_id AND wallet = p_wallet;
$$;

CREATE OR REPLACE FUNCTION public.top_up_test_credits(
    p_user_id uuid, p_kind text, p_reference text, p_seconds integer, p_amount_cents integer, p_label text
) RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF p_kind NOT IN ('simulated', 'stripe_test') THEN
        RAISE EXCEPTION 'Invalid test recharge source';
    END IF;

    INSERT INTO public.credit_accounts(user_id, wallet) VALUES (p_user_id, 'test')
    ON CONFLICT DO NOTHING;

    PERFORM 1 FROM public.credit_accounts WHERE user_id = p_user_id AND wallet = 'test' FOR UPDATE;
    INSERT INTO public.credit_movements(user_id, wallet, kind, reference, seconds, amount_cents, label)
    VALUES (p_user_id, 'test', p_kind, p_reference, p_seconds, p_amount_cents, p_label)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN false; END IF;

    UPDATE public.credit_accounts SET balance_seconds = balance_seconds + p_seconds
    WHERE user_id = p_user_id AND wallet = 'test';
    RETURN true;
END;
$$;

CREATE FUNCTION public.reserve_transcription_credit(
    p_user_id uuid, p_filename text, p_language text, p_seconds integer, p_wallet text DEFAULT 'test'
) RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_balance bigint;
    v_reserved bigint;
    v_id uuid;
BEGIN
    SELECT balance_seconds INTO v_balance FROM public.credit_accounts
    WHERE user_id = p_user_id AND wallet = p_wallet FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT COALESCE(SUM(seconds), 0) INTO v_reserved FROM public.credit_reservations WHERE user_id = p_user_id AND wallet = p_wallet;
    IF v_balance - v_reserved < p_seconds THEN RETURN NULL; END IF;

    INSERT INTO public.transcriptions(user_id, filename, language, status)
    VALUES (p_user_id, p_filename, p_language, 'processing') RETURNING id INTO v_id;
    INSERT INTO public.credit_reservations(transcription_id, user_id, wallet, seconds)
    VALUES (v_id, p_user_id, p_wallet, p_seconds);
    RETURN v_id;
END;
$$;

-- The existing finish_transcription_job() inserts usage in the same transaction as the result.
CREATE OR REPLACE FUNCTION public.consume_reserved_credit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_wallet text;
    v_seconds integer;
BEGIN
    SELECT wallet INTO v_wallet FROM public.credit_reservations
    WHERE transcription_id = NEW.transcription_id AND user_id = NEW.user_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    PERFORM 1 FROM public.credit_accounts
    WHERE user_id = NEW.user_id AND wallet = v_wallet FOR UPDATE;
    DELETE FROM public.credit_reservations
    WHERE transcription_id = NEW.transcription_id AND user_id = NEW.user_id AND wallet = v_wallet
    RETURNING seconds INTO v_seconds;
    IF NOT FOUND THEN RETURN NEW; END IF;

    UPDATE public.credit_accounts SET balance_seconds = balance_seconds - v_seconds
    WHERE user_id = NEW.user_id AND wallet = v_wallet;
    INSERT INTO public.credit_movements(user_id, wallet, kind, reference, seconds, label)
    SELECT NEW.user_id, v_wallet, 'transcription', NEW.transcription_id::text, -v_seconds, filename
    FROM public.transcriptions WHERE id = NEW.transcription_id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_summary(uuid, text),
    public.reserve_transcription_credit(uuid, text, text, integer, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_summary(uuid, text),
    public.reserve_transcription_credit(uuid, text, text, integer, text)
    TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
