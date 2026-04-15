-- Create releases table for Recent Work section
CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read releases (public website)
CREATE POLICY "Allow public read access" ON releases 
  FOR SELECT USING (true);

-- Create admin_users table to track who can manage releases
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS on admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Allow admins to read their own record
CREATE POLICY "Admins can read their own record" ON admin_users
  FOR SELECT USING (auth.uid() = user_id);

-- Allow admins to manage releases
CREATE POLICY "Admins can insert releases" ON releases
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can update releases" ON releases
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can delete releases" ON releases
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- Create index for ordering
CREATE INDEX IF NOT EXISTS releases_display_order_idx ON releases(display_order);
