import { Module } from "@nestjs/common";
import { CourseResultCompositionService } from "./course-result-composition.service";

@Module({ providers: [CourseResultCompositionService], exports: [CourseResultCompositionService] })
export class CourseResultCompositionModule {}
