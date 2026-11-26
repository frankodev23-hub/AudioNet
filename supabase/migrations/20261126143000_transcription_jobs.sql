BEGIN;

CREATE TABLE public.transcription_jobs (
    transcription_id uuid PRIMARY KEY REFERENCES public.transcriptions (id) ON DELETE CASCADE,
    provider_job_id text NOT NULL UNIQUE,
    next_poll_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transcription_jobs_next_poll_idx ON public.transcription_jobs (next_poll_at);
ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transcription_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcription_jobs TO service_role;

CREATE FUNCTION public.register_transcription_job(
    p_transcription_id uuid, p_user_id uuid, p_provider_job_id text, p_storage_key text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    UPDATE public.transcriptions
       SET storage_key = p_storage_key
     WHERE id = p_transcription_id AND user_id = p_user_id AND status = 'processing';
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    INSERT INTO public.transcription_jobs (transcription_id, provider_job_id)
    VALUES (p_transcription_id, p_provider_job_id);
    RETURN true;
END;
$$;

CREATE FUNCTION public.claim_transcription_jobs()
RETURNS SETOF public.transcription_jobs
LANGUAGE sql SET search_path = '' AS $$
    WITH due AS (
        SELECT transcription_id
          FROM public.transcription_jobs
         WHERE next_poll_at <= now()
         ORDER BY next_poll_at, transcription_id
         LIMIT 20
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.transcription_jobs AS job
       SET next_poll_at = now() + interval '45 seconds'
      FROM due
     WHERE job.transcription_id = due.transcription_id
    RETURNING job.*;
$$;

CREATE FUNCTION public.finish_transcription_job(
    p_transcription_id uuid, p_claim_until timestamptz,
    p_result jsonb, p_segments jsonb, p_error text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    v_transcription public.transcriptions%ROWTYPE;
    v_result public.transcriptions%ROWTYPE;
BEGIN
    SELECT * INTO v_transcription
      FROM public.transcriptions
     WHERE id = p_transcription_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    DELETE FROM public.transcription_jobs
     WHERE transcription_id = p_transcription_id AND next_poll_at = p_claim_until;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF v_transcription.status <> 'processing' THEN
        RETURN false;
    END IF;

    IF p_error IS NOT NULL THEN
        UPDATE public.transcriptions SET status = 'failed', error_message = p_error
         WHERE id = p_transcription_id;
        RETURN true;
    END IF;

    SELECT * INTO v_result FROM jsonb_populate_record(NULL::public.transcriptions, p_result);

    INSERT INTO public.transcription_segments (transcription_id, segment_order, start_time, end_time, text)
    SELECT p_transcription_id, (position - 1)::integer,
           COALESCE((segment ->> 'start')::numeric, 0),
           COALESCE((segment ->> 'end')::numeric, 0),
           COALESCE(segment ->> 'text', '')
      FROM jsonb_array_elements(p_segments) WITH ORDINALITY AS item(segment, position);

    UPDATE public.transcriptions
       SET status = 'completed', error_message = NULL, completed_at = now(),
           language = COALESCE(v_result.language, v_transcription.language),
           transcript_text = v_result.transcript_text, duration = v_result.duration,
           paragraph_count = v_result.paragraph_count, word_count = v_result.word_count,
           processing_time_seconds = v_result.processing_time_seconds,
           character_count = v_result.character_count,
           character_count_no_whitespace = v_result.character_count_no_whitespace,
           segment_count = v_result.segment_count, processing_speed = v_result.processing_speed
     WHERE id = p_transcription_id;

    INSERT INTO public.usage_records (user_id, transcription_id, duration_seconds)
    VALUES (v_transcription.user_id, p_transcription_id, v_result.duration)
    ON CONFLICT (transcription_id) DO NOTHING;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.register_transcription_job(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_transcription_jobs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_transcription_job(uuid, timestamptz, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_transcription_job(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_transcription_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_transcription_job(uuid, timestamptz, jsonb, jsonb, text) TO service_role;

COMMIT;
