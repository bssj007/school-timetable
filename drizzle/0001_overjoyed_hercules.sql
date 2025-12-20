CREATE TABLE `performanceAssessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`assessmentDate` varchar(10) NOT NULL,
	`subject` varchar(100) NOT NULL,
	`content` text NOT NULL,
	`classTime` int,
	`weekday` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performanceAssessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `timetables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`schoolCode` int NOT NULL,
	`schoolName` varchar(255) NOT NULL,
	`region` varchar(100) NOT NULL,
	`grade` int NOT NULL,
	`class` int NOT NULL,
	`weekday` int NOT NULL,
	`classTime` int NOT NULL,
	`teacher` varchar(100),
	`subject` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `timetables_id` PRIMARY KEY(`id`)
);
