import { CourseResultCompositionModule } from "@/modules/course-result-composition/course-result-composition.module";
import { Module } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { FinalFormativeService } from "./final-formative.service";

@Module({ imports: [PrismaModule, CourseResultCompositionModule], providers: [FinalFormativeService], exports: [FinalFormativeService] })
export class FinalFormativeModule {}
