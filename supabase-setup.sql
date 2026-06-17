-- ========================================
-- OpenGIS — Supabase SQL Setup
-- Run these in your Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query)
-- ========================================


-- ========================================
-- 1. PROJECTS TABLE
-- Top-level map/workspace
-- ========================================

CREATE TABLE IF NOT EXISTS public.projects (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Untitled Map',
    description TEXT DEFAULT '',
    is_public BOOLEAN DEFAULT false,
    share_token TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert their own projects"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_share_token ON public.projects(share_token);


-- ========================================
-- 2. LAYERS TABLE
-- Named groups of features with styling and schema
-- ========================================

CREATE TABLE IF NOT EXISTS public.layers (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Layer',
    color TEXT DEFAULT '#4C9AFF',
    icon TEXT DEFAULT '📍',
    geometry_type TEXT DEFAULT 'Point' CHECK (geometry_type IN ('Point', 'LineString', 'Polygon')),
    schema JSONB DEFAULT '[]'::jsonb,   -- Array of {key, label, type, required, options, min, max, step}
    visible BOOLEAN DEFAULT true,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view layers of their projects"
    ON public.layers FOR SELECT
    USING (
        auth.uid() = user_id
        OR project_id IN (SELECT id FROM public.projects WHERE is_public = true)
    );

CREATE POLICY "Users can insert layers"
    ON public.layers FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their layers"
    ON public.layers FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their layers"
    ON public.layers FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_layers_project ON public.layers(project_id);
CREATE INDEX IF NOT EXISTS idx_layers_user ON public.layers(user_id);


-- ========================================
-- 3. FEATURES TABLE
-- Individual spatial objects (points, lines, polygons)
-- ========================================

CREATE TABLE IF NOT EXISTS public.features (
    id BIGSERIAL PRIMARY KEY,
    layer_id BIGINT REFERENCES public.layers(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    geometry_type TEXT NOT NULL CHECK (geometry_type IN ('Point', 'LineString', 'Polygon')),
    coordinates JSONB NOT NULL,          -- Point: {lat, lng}  |  Line/Polygon: [{lat, lng}, ...]
    attributes JSONB DEFAULT '{}'::jsonb, -- Flexible key-value pairs matching layer schema
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view features of their layers"
    ON public.features FOR SELECT
    USING (
        auth.uid() = user_id
        OR layer_id IN (
            SELECT l.id FROM public.layers l
            JOIN public.projects p ON l.project_id = p.id
            WHERE p.is_public = true
        )
    );

CREATE POLICY "Users can insert features"
    ON public.features FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their features"
    ON public.features FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their features"
    ON public.features FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_features_layer ON public.features(layer_id);
CREATE INDEX IF NOT EXISTS idx_features_user ON public.features(user_id);
CREATE INDEX IF NOT EXISTS idx_features_geometry_type ON public.features(geometry_type);
CREATE INDEX IF NOT EXISTS idx_features_created ON public.features(created_at DESC);


-- ========================================
-- 4. TRIGGERS — Auto-update updated_at
-- ========================================

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist (safe for re-run)
DROP TRIGGER IF EXISTS update_projects_modtime ON public.projects;
DROP TRIGGER IF EXISTS update_layers_modtime ON public.layers;
DROP TRIGGER IF EXISTS update_features_modtime ON public.features;

CREATE TRIGGER update_projects_modtime
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_layers_modtime
    BEFORE UPDATE ON public.layers
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_features_modtime
    BEFORE UPDATE ON public.features
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- ========================================
-- 5. STORAGE BUCKET for feature photos
-- ========================================

-- Create the bucket (run once)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feature-photos', 'feature-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "Users can upload feature photos" ON storage.objects;
CREATE POLICY "Users can upload feature photos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'feature-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow public read access to photos
DROP POLICY IF EXISTS "Public feature photo access" ON storage.objects;
CREATE POLICY "Public feature photo access"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'feature-photos');

-- Allow users to delete their own photos
DROP POLICY IF EXISTS "Users can delete own feature photos" ON storage.objects;
CREATE POLICY "Users can delete own feature photos"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'feature-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );


-- ========================================
-- 6. ENABLE REALTIME
-- ========================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.features;
ALTER PUBLICATION supabase_realtime ADD TABLE public.layers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;


-- ========================================
-- 7. AUDIT LOG (optional — generalized)
-- ========================================

CREATE TABLE IF NOT EXISTS public.feature_audit_log (
    id BIGSERIAL PRIMARY KEY,
    feature_id BIGINT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.feature_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs"
    ON public.feature_audit_log FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert audit logs"
    ON public.feature_audit_log FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION log_feature_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.feature_audit_log (feature_id, user_id, action, new_data)
        VALUES (NEW.id, NEW.user_id, 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.feature_audit_log (feature_id, user_id, action, old_data, new_data)
        VALUES (NEW.id, NEW.user_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.feature_audit_log (feature_id, user_id, action, old_data)
        VALUES (OLD.id, OLD.user_id, 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

DROP TRIGGER IF EXISTS feature_audit_trigger ON public.features;
CREATE TRIGGER feature_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.features
    FOR EACH ROW EXECUTE FUNCTION log_feature_changes();

CREATE INDEX IF NOT EXISTS idx_feature_audit_id ON public.feature_audit_log(feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_audit_created ON public.feature_audit_log(created_at DESC);


-- ========================================
-- DONE! 🎉
-- Your OpenGIS backend is ready.
-- ========================================
