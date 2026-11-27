BEGIN;

ALTER TABLE public.credit_movements DROP CONSTRAINT credit_movements_kind_check;
ALTER TABLE public.credit_movements DROP CONSTRAINT credit_movements_check1;
ALTER TABLE public.credit_movements ADD CONSTRAINT credit_movements_kind_by_wallet_check CHECK (
    kind = 'transcription'
    OR (wallet = 'test' AND kind IN ('simulated', 'stripe_test'))
    OR (wallet = 'live' AND kind = 'stripe_live')
);
CREATE UNIQUE INDEX credit_stripe_live_session_idx
    ON public.credit_movements(reference) WHERE kind = 'stripe_live';

CREATE FUNCTION public.top_up_credits(
    p_user_id uuid, p_kind text, p_reference text, p_seconds integer, p_amount_cents integer, p_label text
) RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_wallet text;
BEGIN
    IF p_kind IS NULL OR p_kind NOT IN ('simulated', 'stripe_test', 'stripe_live') THEN
        RAISE EXCEPTION 'Invalid recharge source';
    END IF;

    v_wallet := CASE WHEN p_kind = 'stripe_live' THEN 'live' ELSE 'test' END;

    INSERT INTO public.credit_accounts(user_id, wallet) VALUES (p_user_id, v_wallet)
    ON CONFLICT DO NOTHING;

    PERFORM 1 FROM public.credit_accounts WHERE user_id = p_user_id AND wallet = v_wallet FOR UPDATE;
    INSERT INTO public.credit_movements(user_id, wallet, kind, reference, seconds, amount_cents, label)
    VALUES (p_user_id, v_wallet, p_kind, p_reference, p_seconds, p_amount_cents, p_label)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN false; END IF;

    UPDATE public.credit_accounts SET balance_seconds = balance_seconds + p_seconds
    WHERE user_id = p_user_id AND wallet = v_wallet;
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.top_up_test_credits(
    p_user_id uuid, p_kind text, p_reference text, p_seconds integer, p_amount_cents integer, p_label text
) RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF p_kind IS NULL OR p_kind NOT IN ('simulated', 'stripe_test') THEN
        RAISE EXCEPTION 'Invalid test recharge source';
    END IF;
    RETURN public.top_up_credits(p_user_id, p_kind, p_reference, p_seconds, p_amount_cents, p_label);
END;
$$;

REVOKE ALL ON FUNCTION public.top_up_credits(uuid, text, text, integer, integer, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.top_up_credits(uuid, text, text, integer, integer, text)
    TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
