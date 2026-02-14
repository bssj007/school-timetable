CREATE TABLE `elective_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`grade` int NOT NULL,
	`subject` varchar(100) NOT NULL,
	`originalTeacher` varchar(100) NOT NULL,
	`classCode` varchar(10),
	`fullTeacherName` varchar(100),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`)
);
