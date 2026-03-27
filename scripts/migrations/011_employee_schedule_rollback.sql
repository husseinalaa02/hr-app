-- Rollback 011: remove off_days column and public_holidays table
alter table employees drop column if exists off_days;
drop table if exists public_holidays cascade;
