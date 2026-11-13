-- Five fields the PITX vehicle masterlist carries that `vehicles` had no
-- column for, plus the gate assignments those same sheets can fill in.
--
-- The masterlist workbook's "Database- City Provl" sheet records a
-- province, region, cluster, transport mode and document type per unit.
-- Only `transport_mode` is really new information to the app - it is what
-- separates a provincial bus (PUB) from a jeepney (MPUJ/TPUJ) or UV
-- Express (MUVE) - but the other four are what the terminal's own gate and
-- route planning is organised around, so they are worth holding next to
-- the unit rather than re-deriving from a spreadsheet each time.
--
-- All five are plain nullable text: the sheet is hand-maintained and its
-- vocabularies still drift (it currently contains a cluster of "0" and one
-- of "are th"), so a CHECK constraint here would only reject imports.
--
-- Run after 202611121200_terminal-operating-system_overview_punctuality.sql.

alter table public.vehicles
  add column if not exists province       text,
  add column if not exists region         text,
  add column if not exists cluster        text,
  add column if not exists transport_mode text,
  add column if not exists document_type  text;

comment on column public.vehicles.province is
  'Province of the unit''s destination, from the masterlist "Database- City '
  'Provl" sheet.';
comment on column public.vehicles.region is
  'Philippine region of the destination (IV-A, NCR, V, ...), same source.';
comment on column public.vehicles.cluster is
  'PITX operating cluster - BICOL, VISMIN, NORTH, LABAZON, MIMAROPA, '
  'CAVITEX, AGUINALDO. Drives which gate a destination is served from; see '
  'route_gates below. The masterlist''s CITY cluster (commuter units) is '
  'deliberately not loaded - this module schedules provincial trips.';
comment on column public.vehicles.transport_mode is
  'PUB (provincial bus), MPUJ / TPUJ (jeepney) or MUVE (UV Express).';
comment on column public.vehicles.document_type is
  'Franchise document on file - CPC, CPC & OR/CR, SPECIAL PERMIT, PA, EOV '
  'and variants. Free text; the masterlist has 41 spellings of it.';

-- ---------------------------------------------------------------------------
-- route_gates: destinations that had no gate.
--
-- The importer only reads the "Database" sheet's own Gate Assignment
-- column, which 40 of its 94 destinations leave blank. The workbook's
-- "Route Database" sheet names the gate for most of them outright, and the
-- "Bay" sheet maps the remaining ones' cluster to a gate (CAVITEX and
-- AGUINALDO are Cavite, so Gate 2).
--
-- Ten of these are destinations vehicles already use today; the rest match
-- the shortened destination names the workbook has moved to, so they are
-- in place before the next masterlist import rather than after it.
--
-- Not included: ALABANG, whose only cluster is CITY (commuter, out of
-- scope here), and SAN JOSE, which is ambiguous between San Jose in
-- Occidental Mindoro, Nueva Ecija and Dinagat Islands. The "0" destination
-- in the workbook is a data error, not a place.
-- ---------------------------------------------------------------------------

insert into public.route_gates (route, gate) values
  ('ALFONSO', 'Gate 2'),
  ('BALANGA', 'Gate 5'),
  ('BALIBAGO', 'Gate 2'),
  ('BANAUE', 'Gate 5'),
  ('BARAS', 'Gate 4'),
  ('BAUAN', 'Gate 2'),
  ('BIÑAN', 'Gate 2'),
  ('BOAC', 'Gate 2'),
  ('BOAC, MARINDUQUE', 'Gate 2'),
  ('BORONGAN', 'Gate 4'),
  ('CALAUAG', 'Gate 2'),
  ('CATARMAN', 'Gate 4'),
  ('COTTA( LUCENA QUEZON)', 'Gate 2'),
  ('DINAGAT ISLANDS', 'Gate 4'),
  ('DONSOL', 'Gate 4'),
  ('GUINAYANGAN', 'Gate 2'),
  ('GUIUAN', 'Gate 4'),
  ('LAOANG', 'Gate 4'),
  ('LEMERY', 'Gate 2'),
  ('LUCENA CITY', 'Gate 2'),
  ('MANDAON', 'Gate 4'),
  ('MARAGONDON', 'Gate 2'),
  ('MARAGONDON, CAVITE', 'Gate 2'),
  ('MARIVELES', 'Gate 5'),
  ('MENDEZ', 'Gate 2'),
  ('NEGROS OCCIDENTAL', 'Gate 4'),
  ('ORAS', 'Gate 4'),
  ('PALAWAN', 'Gate 2'),
  ('PALOMPON', 'Gate 4'),
  ('PARACALE', 'Gate 4'),
  ('PILAR', 'Gate 4'),
  ('PLACER', 'Gate 4'),
  ('PRIETO DIAZ', 'Gate 4'),
  ('SAN ANDRES', 'Gate 2'),
  ('SAN JOSE, OCCIDENTAL MINDORO', 'Gate 2'),
  ('SAN JUAN', 'Gate 2'),
  ('STA. CRUZ', 'Gate 2'),
  ('STA. ROSA', 'Gate 2'),
  ('TAGBILARAN', 'Gate 4'),
  ('TAGKAWAYAN', 'Gate 2'),
  ('TAGUM CITY', 'Gate 4'),
  ('TERNATE', 'Gate 2'),
  ('VIGA', 'Gate 4')
on conflict (route) do nothing;

notify pgrst, 'reload schema';
