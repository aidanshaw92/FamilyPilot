-- FamilyPilot Initial Schema
-- Run via Supabase CLI: supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  home_location TEXT,
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  budget_tier TEXT CHECK (budget_tier IN ('budget', 'moderate', 'premium')) DEFAULT 'moderate',
  max_drive_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Family members
CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('parent', 'child')) NOT NULL,
  date_of_birth DATE,
  school TEXT,
  nursery TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vehicles
CREATE TABLE family_vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  boot_volume_litres INTEGER,
  boot_width_cm INTEGER,
  boot_height_cm INTEGER,
  boot_depth_cm INTEGER,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equipment (pushchairs, car seats, etc.)
CREATE TABLE family_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  volume_litres INTEGER,
  width_cm INTEGER,
  height_cm INTEGER,
  depth_cm INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memberships
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  membership_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interests
CREATE TABLE interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Venues (cached from external providers)
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id TEXT,
  provider TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  address TEXT,
  description TEXT,
  opening_hours JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, external_id)
);

CREATE TABLE venue_facilities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  facility_type TEXT NOT NULL,
  available BOOLEAN DEFAULT true,
  notes TEXT,
  UNIQUE(venue_id, facility_type)
);

CREATE TABLE venue_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- Family scores (cached, personalised)
CREATE TABLE venue_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  factors JSONB NOT NULL,
  explanation TEXT[] NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venue_id, profile_id)
);

-- Trips
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status TEXT CHECK (status IN ('draft', 'planned', 'completed')) DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trip_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
  venue_id UUID REFERENCES venues(id),
  sort_order INTEGER NOT NULL,
  start_time TIME,
  stop_type TEXT CHECK (stop_type IN ('venue', 'meal', 'travel', 'home')),
  title TEXT,
  notes TEXT
);

-- Packing lists
CREATE TABLE packing_lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE packing_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  packing_list_id UUID REFERENCES packing_lists(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  packed BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0
);

-- Saved items
CREATE TABLE saved_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  item_type TEXT NOT NULL,
  item_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, item_type, item_id)
);

-- Holiday searches
CREATE TABLE holiday_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  destination TEXT NOT NULL,
  departure_date DATE,
  return_date DATE,
  travellers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE holiday_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_id UUID REFERENCES holiday_searches(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  hotel_name TEXT NOT NULL,
  price_pence INTEGER NOT NULL,
  score INTEGER,
  factors JSONB,
  highlights TEXT[],
  recommended BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE holiday_offers ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
CREATE POLICY "Users manage own profile" ON profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own family members" ON family_members
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own vehicles" ON family_vehicles
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own equipment" ON family_equipment
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own memberships" ON memberships
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own interests" ON interests
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own scores" ON venue_scores
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own trips" ON trips
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own trip stops" ON trip_stops
  FOR ALL USING (trip_id IN (
    SELECT id FROM trips WHERE profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users manage own packing lists" ON packing_lists
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own packing items" ON packing_items
  FOR ALL USING (packing_list_id IN (
    SELECT id FROM packing_lists WHERE profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users manage own saved items" ON saved_items
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own holiday searches" ON holiday_searches
  FOR ALL USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users manage own holiday offers" ON holiday_offers
  FOR ALL USING (search_id IN (
    SELECT id FROM holiday_searches WHERE profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  ));

-- Venues are publicly readable (cached external data)
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venues are publicly readable" ON venues FOR SELECT USING (true);
CREATE POLICY "Venue facilities are publicly readable" ON venue_facilities FOR SELECT USING (true);
CREATE POLICY "Venue photos are publicly readable" ON venue_photos FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_venues_location ON venues (lat, lng);
CREATE INDEX idx_venues_category ON venues (category);
CREATE INDEX idx_venue_scores_profile ON venue_scores (profile_id);
CREATE INDEX idx_saved_items_profile ON saved_items (profile_id);
CREATE INDEX idx_trips_profile ON trips (profile_id);
