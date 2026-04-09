PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_photosets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`year` integer NOT NULL,
	`bucket_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text,
	`uploaded_at` text
);
--> statement-breakpoint
INSERT INTO `__new_photosets`("id", "name", "location", "year", "bucket_name", "status", "created_at", "updated_at", "published_at", "uploaded_at") SELECT "id", "name", COALESCE("location", ''), "year", "bucket_name", "status", "created_at", "updated_at", "published_at", "uploaded_at" FROM `photosets`;--> statement-breakpoint
DROP TABLE `photosets`;--> statement-breakpoint
ALTER TABLE `__new_photosets` RENAME TO `photosets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;