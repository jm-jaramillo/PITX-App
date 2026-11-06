-- Ticketing demo data: the prototype's dummy database, so the Ticketing pages
-- have something to show before Trip Scheduling's feed is connected.
--
-- Operator names are real (the five with logos). Routes, fares, plates, units,
-- trips and passengers are made up. Every row has is_demo = true and is
-- removed by public.ticketing_clear_demo(). Trips are dated from the day this
-- runs (Manila). Running it again adds nothing while demo trips exist.
--
-- DEV PROJECT ONLY. This is not a migration; never run it on production. Run
-- it after all the ticketing and core migrations. It turns on
-- settings.demo_mode at the end: with demo_mode off, demo rows stay out of
-- every page, booking and report.

insert into ticketing.provinces (code, description, is_demo) values
  ('MM',  'Metro Manila', true),
  ('BAT', 'Batangas',     true),
  ('ALB', 'Albay',        true),
  ('BEN', 'Benguet',      true),
  ('QUE', 'Quezon',       true),
  ('PAN', 'Pangasinan',   true),
  ('CEB', 'Cebu',         true)
on conflict (code) do nothing;

insert into ticketing.towns (code, description, province_code, is_demo) values
  ('PQUE', 'Parañaque',     'MM',  true),
  ('BATC', 'Batangas City', 'BAT', true),
  ('LEG',  'Legazpi',       'ALB', true),
  ('BAG',  'Baguio',        'BEN', true),
  ('LUC',  'Lucena',        'QUE', true),
  ('DAG',  'Dagupan',       'PAN', true),
  ('CEBC', 'Cebu City',     'CEB', true)
on conflict (code) do nothing;

insert into ticketing.companies (code, name, description, logo, registration_no, ptu_no, tin, serial_no, min_no,
                                 ticket_code, advance_days, address, contact_person, mobile_no, is_demo)
select c.code, c.name, c.name || ' (demo)', c.logo,
       'DEMO-REG-' || (1000 + c.n), 'DEMO-PTU-' || (1000 + c.n), '000-000-000-000',
       'DEMO-SN-' || (1000 + c.n), 'DEMO-MIN-' || (1000 + c.n),
       c.code, 7, 'Demo address, Parañaque City', c.code || ' Demo Contact', '0900 000 0000', true
  from (values
    (1, 'DLTB', 'DEL MONTE MOTOR WORKS INC (DLTB)', 'brand/operators/dltb.jpg'),
    (2, 'KRS',  'KERSTEEN',                         'brand/operators/kersteen.png'),
    (3, 'LOR',  'LORNA EXPRESS',                    'brand/operators/lorna.jpg'),
    (4, 'OGW',  'OGAWA LINER',                      'brand/operators/ogawa.jpg'),
    (5, 'SCE',  'SOUTH CITY EXPRESS INC',           'brand/operators/south-city.jpg')
  ) as c(n, code, name, logo)
on conflict (code) do nothing;

insert into ticketing.counters (code, description, ticket_code, kiosk, town_code, allow_internet, counter_display, kiosk_display, is_demo) values
  ('C01', 'Booth 1', 'A', false, 'PQUE', false, true,  false, true),
  ('C02', 'Booth 2', 'B', false, 'PQUE', false, true,  false, true),
  ('K01', 'Kiosk 1', 'K', true,  'PQUE', true,  false, true,  true)
on conflict (code) do nothing;

-- [company, bus type, description, seat layout, blocked seats]
insert into ticketing.bus_types (company_code, code, description, layout_id, blocked_seats, is_demo) values
  ('DLTB', 'REG45', 'Regular aircon', '45', '{}',      true),
  ('DLTB', 'HC61',  'High capacity',  '61', '{}',      true),
  ('KRS',  'REG53', 'Regular aircon', '53', '{}',      true),
  ('KRS',  'CR49',  'Aircon with CR', '49', '{48,49}', true),
  ('LOR',  'REG45', 'Regular aircon', '45', '{}',      true),
  ('LOR',  'HC66',  'High capacity',  '66', '{}',      true),
  ('OGW',  'DLX36', 'Deluxe',         '36', '{}',      true),
  ('OGW',  'SUP26', 'Super deluxe',   '26', '{}',      true),
  ('SCE',  'REG49', 'Regular aircon', '49', '{}',      true),
  ('SCE',  'HC63',  'High capacity',  '63', '{}',      true)
on conflict do nothing;

-- Two units per bus type, so a replacement unit can be tested.
insert into ticketing.buses (plate_no, company_code, bus_type_code, description, charter, is_demo)
select 'DEMO ' || (1000 + (t.i - 1) * 10 + u.n), t.company_code, t.code, 'Unit ' || ((t.i - 1) * 2 + u.n),
       case when u.n = 2 and (t.i - 1) % 3 = 0 then 'Monthly Chartered'
            when u.n = 2 and (t.i - 1) % 3 = 1 then 'Special Chartered'
            else 'Not Chartered' end,
       true
  from (select b.*, row_number() over (order by b.company_code, b.code) as i
          from ticketing.bus_types b where b.is_demo) t
  cross join (values (1), (2)) as u(n)
on conflict (plate_no) do nothing;

insert into ticketing.routes (code, company_code, description, denomination, province_code, town_code, adult,
                              message, authorized_agent, is_demo)
select r.code, r.company_code, 'PITX to ' || r.denomination, r.denomination, r.province_code, r.town_code, r.adult,
       'Be at the gate 30 minutes before departure.', r.company_code || ' Demo Agent', true
  from (values
    ('DLTB-BATANGAS', 'DLTB', 'BATANGAS',        'BAT', 'BATC',  250),
    ('DLTB-BICOL',    'DLTB', 'BICOL',           'ALB', 'LEG',  1200),
    ('KRS-BAGUIO',    'KRS',  'BAGUIO',          'BEN', 'BAG',   750),
    ('LOR-QUEZON',    'LOR',  'QUEZON',          'QUE', 'LUC',   450),
    ('OGW-NORTHERN',  'OGW',  'NORTHERN ROUTES', 'PAN', 'DAG',   900),
    ('SCE-VISMIN',    'SCE',  'VISMIN',          'CEB', 'CEBC', 2500)
  ) as r(code, company_code, denomination, province_code, town_code, adult)
on conflict (code) do nothing;

-- Trips and the tickets sold on them, same plan as the prototype.
do $$
declare
  today    date := (now() at time zone 'Asia/Manila')::date;
  sale0    timestamptz := today::timestamp at time zone 'Asia/Manila' + interval '5 hours';
  names_f  text[] := array['Ana', 'Ben', 'Carla', 'Dino', 'Ella', 'Franco', 'Gina', 'Hector', 'Ines', 'Jomar', 'Kim', 'Leo'];
  names_l  text[] := array['Sample', 'Tester', 'Demo', 'Placeholder', 'Mockup', 'Trial', 'Example'];
  p        record;
  trip_id  uuid;
  co       text;
  plate    text;
  blocked  int[];
  price    numeric;
  seq      int := 0;
  seat     int;
  i        int;
  online   boolean;
  ctr      int;
  ftype    text;
  fare     numeric;
  pay      text;
  voided   boolean;
  boarded  boolean;
  tno      text;
  tid      uuid;
begin
  if exists (select 1 from ticketing.trips where is_demo) then
    raise notice 'Demo trips already exist; nothing added';
    return;
  end if;

  for p in
    select * from (values
      ( 1, 'DLTB-BICOL',    'REG45', '05:30', 'B12', 34, 0, 'Departed',  false, false),
      ( 2, 'DLTB-BATANGAS', 'HC61',  '21:15', 'B07', 18, 0, 'Scheduled', false, false),
      ( 3, 'DLTB-BICOL',    null,    '23:00', 'B12',  3, 0, 'Scheduled', false, false),
      ( 4, 'KRS-BAGUIO',    'REG53', '06:30', 'B15', 28, 0, 'Departed',  false, false),
      ( 5, 'KRS-BAGUIO',    'CR49',  '22:00', 'B03', 43, 0, 'Boarding',  false, true),
      ( 6, 'LOR-QUEZON',    'REG45', '12:00', 'B08',  6, 0, 'Cancelled', false, false),
      ( 7, 'LOR-QUEZON',    'HC66',  '21:30', 'B04', 25, 0, 'Scheduled', true,  false),
      ( 8, 'OGW-NORTHERN',  'SUP26', '20:30', 'B18', 26, 0, 'Scheduled', false, true),
      ( 9, 'OGW-NORTHERN',  'DLX36', '22:30', 'B18', 10, 0, 'Scheduled', false, false),
      (10, 'SCE-VISMIN',    'REG49', '20:00', 'B21', 12, 0, 'Scheduled', false, false),
      (11, 'SCE-VISMIN',    null,    '23:30', 'B22',  0, 0, 'Scheduled', false, false),
      (12, 'DLTB-BICOL',    'HC61',  '08:00', 'B12',  8, 1, 'Scheduled', false, false),
      (13, 'KRS-BAGUIO',    'REG53', '07:00', 'B15',  5, 1, 'Scheduled', false, false),
      (14, 'LOR-QUEZON',    'REG45', '10:00', 'B08',  4, 1, 'Scheduled', false, false),
      (15, 'OGW-NORTHERN',  'DLX36', '09:00', 'B18',  3, 1, 'Scheduled', false, false),
      (16, 'SCE-VISMIN',    'HC63',  '09:30', 'B22',  6, 2, 'Scheduled', false, false)
    ) as v(n, route, bus_type, at, bay, sold, day, status, stop_selling, no_voids)
    order by n
  loop
    co := split_part(p.route, '-', 1);
    select b.plate_no into plate
      from ticketing.buses b
     where b.company_code = co and b.bus_type_code = p.bus_type and b.is_demo
     order by b.plate_no limit 1;
    select coalesce(bt.blocked_seats, '{}') into blocked
      from ticketing.bus_types bt where bt.company_code = co and bt.code = p.bus_type;
    blocked := coalesce(blocked, '{}');
    select r.adult into price from ticketing.routes r where r.code = p.route;

    insert into ticketing.trips (trip_no, trip_date, trip_time, route_code, plate_no, bay, status, stop_selling, is_demo)
    values ('DEMO-T' || lpad(p.n::text, 4, '0'), today + p.day, p.at::time, p.route,
            case when p.bus_type is null then null else plate end, p.bay, p.status, p.stop_selling, true)
    returning id into trip_id;

    seat := 0;
    for i in 0 .. p.sold - 1 loop
      seat := seat + 1;
      while seat = any(blocked) loop seat := seat + 1; end loop;
      seq := seq + 1;
      online  := i % 5 = 4 or p.bus_type is null;
      ftype   := case i % 11 when 3 then 'Student' when 6 then 'Senior' when 9 then 'PWD' else 'Adult' end;
      fare    := case when ftype = 'Adult' then price else round(price * 0.8, 2) end;
      pay     := case when online then 'E-Wallet' when i % 4 = 2 then 'Card' when i % 4 = 3 then 'E-Wallet' else 'Cash' end;
      voided  := not online and not p.no_voids and p.status <> 'Departed' and i % 13 = 8;
      boarded := p.status = 'Departed' or (p.status = 'Boarding' and i < p.sold / 2.0);
      ctr     := (p.n - 1 + i) % 2;
      tno     := co || case when online then 'W' when ctr = 1 then 'B' else 'A' end || '-' || lpad(seq::text, 6, '0');

      insert into ticketing.tickets (
        ticket_no, source, booking_ref, trip_id, counter_code, sold_by, seat_no, passenger_name, contact_no, email,
        fare_type, fare, id_no, payment_method, tendered, payment_ref, issued_at, status, printed,
        void_reason, voided_by, refund_category, refund_amount, refund_method, refund_ref, is_demo)
      values (
        tno,
        case when online then 'Online' else 'Counter' end,
        case when online then 'BK-' || lpad(seq::text, 5, '0') end,
        trip_id,
        case when online then null when ctr = 1 then 'C02' else 'C01' end,
        case when online then null else co || ' Teller ' || (ctr + 1) end,
        seat,
        names_f[seq % 12 + 1] || ' ' || names_l[seq % 7 + 1],
        '0900 000 0000',
        'passenger' || seq || '@example.com',
        ftype, fare,
        case when ftype = 'Adult' then null else 'DEMO-ID-' || seq end,
        pay,
        case when pay = 'Cash' then ceil(fare / 100) * 100 end,
        case when pay = 'Cash' then null else 'DEMO-REF-' || seq end,
        sale0 + make_interval(mins => seq),
        case when voided then 'Voided' when boarded then 'Boarded' when online then 'Booked' else 'Issued' end,
        not online,
        case when voided then 'Passenger changed plans (demo)' end,
        case when voided then co || ' Teller ' || (ctr + 1) end,
        case when voided then 'Passenger changed plans' end,
        case when voided then fare end,
        case when voided then pay end,
        case when voided and pay <> 'Cash' then 'DEMO-RFD-' || seq end,
        true)
      returning id into tid;

      insert into ticketing.audit_log (at, by_name, action, ticket_id, trip_id, detail, is_demo)
      values (sale0 + make_interval(mins => seq),
              case when online then 'Booking import' else co || ' Teller ' || (ctr + 1) end,
              case when online then 'Booking imported' else 'Ticket sold' end,
              tid, trip_id,
              tno || ', DEMO-T' || lpad(p.n::text, 4, '0') || ' seat ' || seat,
              true);
    end loop;
  end loop;
end $$;

update ticketing.settings set demo_mode = true where id = 1;
