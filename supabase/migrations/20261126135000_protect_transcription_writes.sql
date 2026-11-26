BEGIN;

-- The frontend supplied with AudioNet uses FastAPI for writes to these tables.
-- Keep authenticated, RLS-scoped reads for existing clients.
REVOKE ALL PRIVILEGES ON TABLE
    public.transcriptions,
    public.transcription_segments,
    public.transcription_tag_links,
    public.transcription_versions,
    public.usage_records
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
    public.transcriptions,
    public.transcription_segments,
    public.transcription_tag_links,
    public.transcription_versions
TO authenticated;

COMMIT;
