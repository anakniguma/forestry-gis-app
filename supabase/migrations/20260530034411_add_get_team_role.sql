CREATE OR REPLACE FUNCTION public.get_team_role(t_id BIGINT, u_id UUID)
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $body$
DECLARE
    v_role TEXT;
BEGIN
    ...
END;
$body$;

