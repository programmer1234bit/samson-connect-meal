CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100) UNIQUE,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    role VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);
 
CREATE TABLE cart (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    meal_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    price INT NOT NULL,
    quantity INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE menu (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    category VARCHAR(50) NOT NULL, -- street, restaurant, beverages
    image_url TEXT
);

CREATE TABLE contact_messages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- this is for an emergency table but never used in ux despite of present in db
CREATE TABLE meals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    supplier_id INT REFERENCES users(id),
    price INT NOT NULL,
    status VARCHAR(20) DEFAULT 'Available',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE system_settings (
    id SERIAL PRIMARY KEY,
    key_name VARCHAR(50) UNIQUE NOT NULL,
    value TEXT NOT NULL
);

INSERT INTO system_settings (key_name, value) VALUES
('currency', 'TZS'),
('timezone', 'EAT'),
('theme', 'light'),
('emailNotif', 'true'),
('smsNotif', 'false'),
('pushNotif', 'true');




  ALTER TABLE contact_messages
ADD COLUMN read BOOLEAN DEFAULT FALSE;

ALTER TABLE contact_messages
ADD COLUMN read_at TIMESTAMP;

	ALTER TABLE users
ADD COLUMN status VARCHAR(10) DEFAULT 'Active';

ALTER TABLE users
ADD COLUMN last_active TIMESTAMP DEFAULT;

ALTER TABLE users
ADD COLUMN phone integer (10);

ALTER TABLE users
ADD COLUMN profile_pic varchar(100);

ALTER TABLE cart
ADD COLUMN status VARCHAR(20) DEFAULT 'Pending';

-- Add meal status
ALTER TABLE menu ADD COLUMN status VARCHAR(20) DEFAULT 'Available';

-- Add supplier_id
ALTER TABLE menu ADD COLUMN supplier_id INT; -- ideally FK to a suppliers/users table
 
ALTER TABLE cart ADD COLUMN supplier_id INT;
 
 
 --updated user table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    email VARCHAR(100) UNIQUE,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    role VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(10) DEFAULT 'Active',
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    phone VARCHAR(10),
    profile_pic VARCHAR(100)
);

ALTER TABLE users
ADD COLUMN restaurant_name VARCHAR(100),
ADD COLUMN location VARCHAR(100),
ADD COLUMN bank_account VARCHAR(50);

ALTER TABLE users ADD COLUMN location POINT;
ALTER TABLE users ADD COLUMN service_radius_km INTEGER;

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    supplier_name VARCHAR(255),
    items JSONB NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    delivery_address TEXT NOT NULL,
    user_coords JSONB,
    distance DECIMAL(10,2) DEFAULT 0,
    eta INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'confirmed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add delivery coordinates and user_coords for orders (safe: IF NOT EXISTS)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS user_coords jsonb;

-- Optional: supplier location fields if you later want to store supplier coords on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS supplier_lat double precision,
  ADD COLUMN IF NOT EXISTS supplier_lng double precision,
  ADD COLUMN IF NOT EXISTS supplier_coords jsonb;

-- Add simple indexes to speed geo lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_orders_delivery_lat ON orders (delivery_lat);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_lng ON orders (delivery_lng);
CREATE INDEX IF NOT EXISTS idx_orders_supplier_lat ON orders (supplier_lat);
CREATE INDEX IF NOT EXISTS idx_orders_supplier_lng ON orders (supplier_lng);

ALTER TABLE cart ADD COLUMN order_id INT;
ALTER TABLE cart ADD COLUMN status VARCHAR(50) DEFAULT 'Pending';

-- Add missing columns used by the checkout / supplier features

-- 1) Orders: store customer coordinates and supplier coordinates
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_coords jsonb,
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS supplier_coords jsonb,
  ADD COLUMN IF NOT EXISTS supplier_lat double precision,
  ADD COLUMN IF NOT EXISTS supplier_lng double precision;

-- 2) Cart: ensure expected fields exist so server-side cart lookups work
ALTER TABLE cart
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS meal_id integer,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS status text;

-- 3) Optional indexes to speed queries by coordinates
CREATE INDEX IF NOT EXISTS idx_orders_delivery_lat ON orders (delivery_lat);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_lng ON orders (delivery_lng);
CREATE INDEX IF NOT EXISTS idx_orders_supplier_lat ON orders (supplier_lat);
CREATE INDEX IF NOT EXISTS idx_orders_supplier_lng ON orders (supplier_lng);

-- 4) Optional: JSONB index for user_coords if you need to query inside it
CREATE INDEX IF NOT EXISTS idx_orders_user_coords_gin ON orders USING gin (user_coords jsonb_path_ops);


ALTER TABLE users ADD COLUMN latitude NUMERIC(10, 7);
ALTER TABLE users ADD COLUMN longitude NUMERIC(10, 7);


ALTER TABLE users ADD COLUMN location VARCHAR(255);
ALTER TABLE users ADD COLUMN bank_account VARCHAR(255);
ALTER TABLE users ADD COLUMN restaurant_name VARCHAR(255);

ALTER TABLE users ADD COLUMN service_radius_km NUMERIC DEFAULT 5.0;