import {
  BeforeApplicationShutdown,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, BeforeApplicationShutdown
{
  async onModuleInit() {
    await this.$connect();
  }

  async beforeApplicationShutdown() {
    await this.$disconnect();
  }
}
