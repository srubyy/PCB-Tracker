-- Drop old check constraint on users role if it exists and restrict to Team Lead and Employee
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users 
ADD CONSTRAINT users_role_check 
CHECK (role IN ('Team Lead', 'Employee'));
