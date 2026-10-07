import { Module } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { FinalFormativeService } from "./final-formative.service";

@Module({ imports: [PrismaModule], providers: [FinalFormativeService], exports: [FinalFormativeService] })
export class FinalFormativeModule {}
