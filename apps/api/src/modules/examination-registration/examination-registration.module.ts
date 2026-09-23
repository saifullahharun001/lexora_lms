import { Module } from "@nestjs/common";
import { PrismaModule } from "@/common/prisma/prisma.module";
import { EvidenceAccessService } from "@/common/academic-evidence/evidence-access.service";
import { AuthorizationModule } from "../authorization/authorization.module";
import { AcademicModule } from "../academic/academic.module";
import { SummativeExaminationModule } from "../summative-examination/summative-examination.module";
import { ExaminationRegistrationService } from "./examination-registration.service";
import { ExaminationAuthorityService } from "./examination-authority.service";
import { ExaminationRegistrationController, ExaminationAuthorityController } from "./examination-registration.controller";
import { PasswordHasherService } from "../identity-access/infrastructure/password-hasher.service";

@Module({ imports: [PrismaModule, AuthorizationModule, AcademicModule, SummativeExaminationModule],
  providers: [PasswordHasherService, EvidenceAccessService, ExaminationRegistrationService, ExaminationAuthorityService],
  controllers: [ExaminationRegistrationController, ExaminationAuthorityController],
  exports: [ExaminationRegistrationService] })
export class ExaminationRegistrationModule {}
