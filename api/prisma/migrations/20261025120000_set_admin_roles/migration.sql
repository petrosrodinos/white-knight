-- Grant elevated roles to the project owners.
UPDATE "users" SET "role" = 'SUPER_ADMIN' WHERE "username_normalized" = 'petrosrodinos';
UPDATE "users" SET "role" = 'ADMIN' WHERE "username_normalized" = 'falcion7';
