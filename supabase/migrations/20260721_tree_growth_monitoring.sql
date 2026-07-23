-- ========================================
-- Tree Growth Monitoring Extension
-- Migration: species, measurements, survey_visits
-- Run in Supabase SQL Editor after the base schema
-- ========================================


-- ========================================
-- 1. SPECIES REFERENCE TABLE
-- Normalized species lookup for trees
-- ========================================

CREATE TABLE IF NOT EXISTS public.species (
    id BIGSERIAL PRIMARY KEY,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    scientific_name TEXT,
    native BOOLEAN DEFAULT true,
    expected_growth_rate NUMERIC(5,2),          -- cm DBH per year
    conservation_status TEXT DEFAULT 'LC'
        CHECK (conservation_status IN ('LC','NT','VU','EN','CR','EW','EX','DD')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;

-- Species are shared reference data: any authenticated user can read
CREATE POLICY "Authenticated users can view species"
    ON public.species FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Any authenticated user can insert species
CREATE POLICY "Authenticated users can insert species"
    ON public.species FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Only the creator can update/delete their species entries
CREATE POLICY "Creator can update species"
    ON public.species FOR UPDATE
    USING (auth.uid() = created_by)
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can delete species"
    ON public.species FOR DELETE
    USING (auth.uid() = created_by);

CREATE INDEX IF NOT EXISTS idx_species_name ON public.species(name);
CREATE INDEX IF NOT EXISTS idx_species_conservation ON public.species(conservation_status);


-- ========================================
-- 2. ADD species_id FK TO FEATURES
-- Nullable — only populated for tree features
-- ========================================

ALTER TABLE public.features
    ADD COLUMN IF NOT EXISTS species_id BIGINT REFERENCES public.species(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_features_species ON public.features(species_id);


-- ========================================
-- 3. MEASUREMENTS TABLE
-- One row per tree per survey visit
-- Source of truth for a tree's current stats
-- ========================================

CREATE TABLE IF NOT EXISTS public.measurements (
    id BIGSERIAL PRIMARY KEY,
    feature_id BIGINT REFERENCES public.features(id) ON DELETE CASCADE NOT NULL,
    surveyor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
    measured_at TIMESTAMPTZ DEFAULT now(),
    dbh_cm NUMERIC(6,1),
    height_m NUMERIC(5,1),
    health_status TEXT DEFAULT 'Healthy'
        CHECK (health_status IN ('Healthy','Diseased','Dead','Stressed')),
    crown_diameter_m NUMERIC(5,1),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

-- Surveyor can see their own measurements
CREATE POLICY "Users can view own measurements"
    ON public.measurements FOR SELECT
    USING (auth.uid() = surveyor_id);

-- Also allow viewing if the parent feature's project is public
CREATE POLICY "Public project measurements are viewable"
    ON public.measurements FOR SELECT
    USING (
        feature_id IN (
            SELECT f.id FROM public.features f
            JOIN public.layers l ON f.layer_id = l.id
            JOIN public.projects p ON l.project_id = p.id
            WHERE p.is_public = true
        )
    );

-- Allow viewing measurements for features owned by the same user
CREATE POLICY "Users can view measurements on own features"
    ON public.measurements FOR SELECT
    USING (
        feature_id IN (
            SELECT f.id FROM public.features f
            WHERE f.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert measurements"
    ON public.measurements FOR INSERT
    WITH CHECK (auth.uid() = surveyor_id);

CREATE POLICY "Users can update own measurements"
    ON public.measurements FOR UPDATE
    USING (auth.uid() = surveyor_id)
    WITH CHECK (auth.uid() = surveyor_id);

CREATE POLICY "Users can delete own measurements"
    ON public.measurements FOR DELETE
    USING (auth.uid() = surveyor_id);

CREATE INDEX IF NOT EXISTS idx_measurements_feature ON public.measurements(feature_id);
CREATE INDEX IF NOT EXISTS idx_measurements_surveyor ON public.measurements(surveyor_id);
CREATE INDEX IF NOT EXISTS idx_measurements_date ON public.measurements(measured_at DESC);


-- ========================================
-- 4. SURVEY VISITS TABLE
-- Logs planned/completed survey routes
-- ========================================

CREATE TABLE IF NOT EXISTS public.survey_visits (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    visit_date DATE DEFAULT CURRENT_DATE,
    plot_ids JSONB DEFAULT '[]'::jsonb,          -- Ordered array of feature IDs (plots)
    computed_route JSONB DEFAULT '{}'::jsonb,     -- {order:[...], totalDistanceM: n, algorithm: "nearest-neighbor"}
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.survey_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own survey visits"
    ON public.survey_visits FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view public project survey visits"
    ON public.survey_visits FOR SELECT
    USING (
        project_id IN (SELECT id FROM public.projects WHERE is_public = true)
    );

CREATE POLICY "Users can insert survey visits"
    ON public.survey_visits FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own survey visits"
    ON public.survey_visits FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own survey visits"
    ON public.survey_visits FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_survey_visits_project ON public.survey_visits(project_id);
CREATE INDEX IF NOT EXISTS idx_survey_visits_user ON public.survey_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_visits_date ON public.survey_visits(visit_date DESC);


-- ========================================
-- 5. TRIGGERS — Auto-update updated_at
-- ========================================

DROP TRIGGER IF EXISTS update_species_modtime ON public.species;
CREATE TRIGGER update_species_modtime
    BEFORE UPDATE ON public.species
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_measurements_modtime ON public.measurements;
CREATE TRIGGER update_measurements_modtime
    BEFORE UPDATE ON public.measurements
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_survey_visits_modtime ON public.survey_visits;
CREATE TRIGGER update_survey_visits_modtime
    BEFORE UPDATE ON public.survey_visits
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- ========================================
-- 6. REALTIME — Subscribe to measurements
-- ========================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.measurements;


-- ========================================
-- 7. SEED DEFAULT SPECIES
-- Common Philippine forestry species
-- ========================================

INSERT INTO public.species (name, scientific_name, native, expected_growth_rate, conservation_status)
VALUES
    ('Narra', 'Pterocarpus indicus', true, 1.20, 'VU'),
    ('Mahogany', 'Swietenia macrophylla', false, 1.80, 'VU'),
    ('Gmelina', 'Gmelina arborea', false, 2.50, 'LC'),
    ('Acacia Mangium', 'Acacia mangium', false, 2.00, 'LC'),
    ('Ipil-ipil', 'Leucaena leucocephala', false, 3.00, 'LC'),
    ('Molave', 'Vitex parviflora', true, 0.80, 'VU'),
    ('Teak', 'Tectona grandis', false, 1.50, 'LC'),
    ('Benguet Pine', 'Pinus kesiya', true, 1.00, 'LC'),
    ('Lauan', 'Shorea contorta', true, 0.90, 'CR'),
    ('Kamagong', 'Diospyros blancoi', true, 0.60, 'VU'),
    ('Dao', 'Dracontomelon dao', true, 1.10, 'LC'),
    ('Almaciga', 'Agathis philippinensis', true, 0.70, 'VU'),
    ('Bagalunga', 'Melia dubia', true, 2.20, 'LC'),
    ('Agoho', 'Casuarina equisetifolia', true, 1.40, 'LC'),
    ('Falcata', 'Paraserianthes falcataria', false, 3.50, 'LC')
ON CONFLICT DO NOTHING;


-- ========================================
-- DONE! 🌳
-- Tree Growth Monitoring tables are ready.
-- ========================================
