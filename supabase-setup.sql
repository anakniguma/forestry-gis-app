-- ========================================
-- Forestry Tree Mapper — Supabase SQL Setup
-- Run these in your Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query)
-- ========================================


-- ========================================
-- 1. CORE TABLES (trees + sample_plots)
-- Skip if these already exist in your DB
-- ========================================

-- Trees table
CREATE TABLE IF NOT EXISTS public.trees (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    species TEXT DEFAULT 'Unknown',
    dbh REAL DEFAULT 0,          -- Diameter at Breast Height in cm
    height REAL DEFAULT 0,       -- Total height in meters
    elevation REAL DEFAULT 0,    -- Altitude in meters (auto-fetched)
    health TEXT DEFAULT 'Healthy' CHECK (health IN ('Healthy', 'Diseased', 'Dead')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sample Plots table
CREATE TABLE IF NOT EXISTS public.sample_plots (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT DEFAULT 'Unnamed Plot',
    notes TEXT,
    coordinates JSONB NOT NULL,  -- Array of {lat, lng} objects
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================================
-- MIGRATION: RUN THIS IF YOUR TABLES ALREADY EXIST BUT LACK THESE COLUMNS!
-- (Fixes: "column 'created_at' does not exist" when creating indexes)
-- =========================================================================
ALTER TABLE public.trees 
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS elevation REAL DEFAULT 0;

ALTER TABLE public.sample_plots 
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();


-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trees_modtime
    BEFORE UPDATE ON public.trees
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_plots_modtime
    BEFORE UPDATE ON public.sample_plots
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- ========================================
-- 2. ROW LEVEL SECURITY (RLS)
-- Users can only see/edit their own data
-- ========================================

ALTER TABLE public.trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_plots ENABLE ROW LEVEL SECURITY;

-- Trees policies
CREATE POLICY "Users can view their own trees"
    ON public.trees FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trees"
    ON public.trees FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trees"
    ON public.trees FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trees"
    ON public.trees FOR DELETE
    USING (auth.uid() = user_id);

-- Sample Plots policies
CREATE POLICY "Users can view their own plots"
    ON public.sample_plots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own plots"
    ON public.sample_plots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plots"
    ON public.sample_plots FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plots"
    ON public.sample_plots FOR DELETE
    USING (auth.uid() = user_id);


-- ========================================
-- 3. INDEXES for performance
-- ========================================

CREATE INDEX IF NOT EXISTS idx_trees_user_id ON public.trees(user_id);
CREATE INDEX IF NOT EXISTS idx_trees_species ON public.trees(species);
CREATE INDEX IF NOT EXISTS idx_trees_health ON public.trees(health);
CREATE INDEX IF NOT EXISTS idx_trees_location ON public.trees(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_trees_created ON public.trees(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_plots_user_id ON public.sample_plots(user_id);
CREATE INDEX IF NOT EXISTS idx_plots_created ON public.sample_plots(created_at DESC);


-- ========================================
-- 4. STORAGE BUCKET for tree photos
-- ========================================

-- Create the bucket (run once)
INSERT INTO storage.buckets (id, name, public)
VALUES ('tree-photos', 'tree-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload photos"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'tree-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow public read access to photos
CREATE POLICY "Public photo access"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'tree-photos');

-- Allow users to delete their own photos
CREATE POLICY "Users can delete own photos"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'tree-photos'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );


-- ========================================
-- 5. MULTI-PHOTO SUPPORT (#17)
-- Optional: enables multiple photos per tree
-- ========================================

CREATE TABLE IF NOT EXISTS public.tree_photos (
    id BIGSERIAL PRIMARY KEY,
    tree_id BIGINT REFERENCES public.trees(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    photo_url TEXT NOT NULL,
    caption TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tree_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view photos of their trees"
    ON public.tree_photos FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can add photos to their trees"
    ON public.tree_photos FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own photos"
    ON public.tree_photos FOR DELETE
    USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tree_photos_tree_id ON public.tree_photos(tree_id);


-- ========================================
-- 6. TEAM / PROJECT SUPPORT (#20)
-- Optional: enables shared projects between users
-- ========================================

-- Teams table
CREATE TABLE IF NOT EXISTS public.teams (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Team Members junction table
CREATE TABLE IF NOT EXISTS public.team_members (
    id BIGSERIAL PRIMARY KEY,
    team_id BIGINT REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(team_id, user_id)
);

-- Add team_id to trees and plots (optional foreign key)
ALTER TABLE public.trees
    ADD COLUMN IF NOT EXISTS team_id BIGINT REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.sample_plots
    ADD COLUMN IF NOT EXISTS team_id BIGINT REFERENCES public.teams(id) ON DELETE SET NULL;

-- RLS for teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Helper function to get team role (bypasses RLS to avoid infinite recursion)
CREATE OR REPLACE FUNCTION public.get_team_role(t_id BIGINT, u_id UUID)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $body$
DECLARE
    v_role TEXT;
BEGIN
    -- Check if owner
    IF EXISTS (SELECT 1 FROM public.teams WHERE id = t_id AND owner_id = u_id) THEN
        RETURN 'owner';
    END IF;

    -- Check membership role
    SELECT role INTO v_role
    FROM public.team_members
    WHERE team_id = t_id AND user_id = u_id;

    RETURN v_role;
END;
$body$;

-- Drop existing policies if they exist to avoid conflict
DROP POLICY IF EXISTS "Users can view teams they belong to" ON public.teams;
DROP POLICY IF EXISTS "Users can create teams" ON public.teams;
DROP POLICY IF EXISTS "Team owners can update their teams" ON public.teams;
DROP POLICY IF EXISTS "Team owners can delete their teams" ON public.teams;
DROP POLICY IF EXISTS "Users can view their team memberships" ON public.team_members;
DROP POLICY IF EXISTS "Team owners/admins can manage members" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view shared trees" ON public.trees;
DROP POLICY IF EXISTS "Team members can view shared plots" ON public.sample_plots;

-- RLS Policies using helper function
CREATE POLICY "Users can view teams they belong to"
    ON public.teams FOR SELECT
    USING (
        owner_id = auth.uid()
        OR public.get_team_role(id, auth.uid()) IS NOT NULL
    );

CREATE POLICY "Users can create teams"
    ON public.teams FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Team owners can update their teams"
    ON public.teams FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Team owners can delete their teams"
    ON public.teams FOR DELETE
    USING (auth.uid() = owner_id);

CREATE POLICY "Users can view their team memberships"
    ON public.team_members FOR SELECT
    USING (
        public.get_team_role(team_id, auth.uid()) IS NOT NULL
    );

CREATE POLICY "Team owners/admins can manage members"
    ON public.team_members FOR ALL
    USING (
        public.get_team_role(team_id, auth.uid()) IN ('owner', 'admin')
    );

-- Optional: Allow team members to see shared trees/plots
CREATE POLICY "Team members can view shared trees"
    ON public.trees FOR SELECT
    USING (
        auth.uid() = user_id
        OR (team_id IS NOT NULL AND public.get_team_role(team_id, auth.uid()) IS NOT NULL)
    );

CREATE POLICY "Team members can view shared plots"
    ON public.sample_plots FOR SELECT
    USING (
        auth.uid() = user_id
        OR (team_id IS NOT NULL AND public.get_team_role(team_id, auth.uid()) IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_teams_owner ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_trees_team ON public.trees(team_id);
CREATE INDEX IF NOT EXISTS idx_plots_team ON public.sample_plots(team_id);


-- ========================================
-- 7. AUDIT LOG / HISTORY (#18)
-- Optional: tracks all changes for timeline view
-- ========================================

CREATE TABLE IF NOT EXISTS public.tree_audit_log (
    id BIGSERIAL PRIMARY KEY,
    tree_id BIGINT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_fields TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.tree_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for their trees"
    ON public.tree_audit_log FOR SELECT
    USING (auth.uid() = user_id);

-- Allow authenticated users to insert their own audit log rows
-- (Also covered by SECURITY DEFINER on the trigger function below)
CREATE POLICY "Users can insert audit logs for their trees"
    ON public.tree_audit_log FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Trigger function to auto-log changes
CREATE OR REPLACE FUNCTION log_tree_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.tree_audit_log (tree_id, user_id, action, new_data)
        VALUES (NEW.id, NEW.user_id, 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.tree_audit_log (tree_id, user_id, action, old_data, new_data, changed_fields)
        VALUES (
            NEW.id,
            NEW.user_id,
            'UPDATE',
            to_jsonb(OLD),
            to_jsonb(NEW),
            ARRAY(
                SELECT key FROM jsonb_each(to_jsonb(NEW))
                WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
            )
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.tree_audit_log (tree_id, user_id, action, old_data)
        VALUES (OLD.id, OLD.user_id, 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
-- SECURITY DEFINER lets this trigger function bypass RLS on tree_audit_log.
-- Without it, the trigger runs as the calling user and is blocked because
-- there is no INSERT policy granting the trigger itself write access.
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER tree_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.trees
    FOR EACH ROW EXECUTE FUNCTION log_tree_changes();

CREATE INDEX IF NOT EXISTS idx_audit_tree_id ON public.tree_audit_log(tree_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.tree_audit_log(created_at DESC);


-- ========================================
-- 8. ENABLE REALTIME (#31)
-- Allows live updates when data changes
-- ========================================

-- Enable realtime for trees and plots tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.trees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sample_plots;


-- ========================================
-- DONE! 🎉
-- Your Supabase backend is fully configured.
-- ========================================
