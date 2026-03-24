CREATE TABLE `access_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`kakaoId` text,
	`kakaoNickname` text,
	`endpoint` text NOT NULL,
	`method` text,
	`userAgent` text,
	`grade` text,
	`classNum` text,
	`studentNumber` text,
	`accessedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocked_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier` text NOT NULL,
	`type` text NOT NULL,
	`reason` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `elective_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grade` integer NOT NULL,
	`subject` text NOT NULL,
	`originalTeacher` text NOT NULL,
	`classCode` text,
	`fullTeacherName` text,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ip_profiles` (
	`ip` text PRIMARY KEY NOT NULL,
	`student_id` integer,
	`kakaoId` text,
	`kakaoNickname` text,
	`lastAccess` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`modificationCount` integer DEFAULT 0,
	`userAgent` text
);
--> statement-breakpoint
CREATE TABLE `kakao_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kakaoId` text NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kakao_tokens_kakaoId_unique` ON `kakao_tokens` (`kakaoId`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`content` text NOT NULL,
	`calories` text,
	`origins` text,
	`type` text DEFAULT '중식',
	`sysId` text DEFAULT 'bssj-h',
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`target_date` text,
	`status` text NOT NULL,
	`message` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `performance_assessments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`dueDate` text NOT NULL,
	`grade` integer NOT NULL,
	`classNum` integer NOT NULL,
	`classTime` integer,
	`isDone` integer DEFAULT 0,
	`dataset` text DEFAULT '' NOT NULL,
	`lastModifiedIp` text,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `student_profiles` (
	`student_id` integer PRIMARY KEY NOT NULL,
	`electives` text,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`grade` integer,
	`class` integer,
	`studentNumber` integer,
	`createdAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`lastSignedIn` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);