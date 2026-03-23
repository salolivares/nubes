CREATE TABLE `photoset_image_outputs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`image_id` integer NOT NULL,
	`image_path` text NOT NULL,
	`type` text NOT NULL,
	`resolution` integer NOT NULL,
	`byte_length` integer NOT NULL,
	FOREIGN KEY (`image_id`) REFERENCES `photoset_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photoset_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photoset_id` integer NOT NULL,
	`name` text NOT NULL,
	`camera` text,
	`original_path` text NOT NULL,
	`preview` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`photoset_id`) REFERENCES `photosets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photosets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`year` integer,
	`camera` text,
	`bucket_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`published_at` text
);
