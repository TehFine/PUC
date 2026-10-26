import { Controller } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateJournalDto, UpdateJournalDto } from "./journal.dto";
import { JournalService } from "./journal.service";

@Controller("journal")
export class JournalController extends CrudController("journal", CreateJournalDto, UpdateJournalDto) {
  constructor(service: JournalService) {
    super(service);
  }
}
