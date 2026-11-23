import { Module } from "@nestjs/common";
import { DeletionRequestsModule } from "../deletion-requests/deletion-requests.module";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";

@Module({
  imports: [DeletionRequestsModule],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
