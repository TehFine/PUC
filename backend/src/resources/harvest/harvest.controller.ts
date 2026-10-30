import { Body, Controller, Get, Param, ParseIntPipe, Post } from "@nestjs/common";
import { CrudController } from "../../common/crud/crud-controller.factory";
import { CreateHarvestLotDto, GenerateItemsDto, UpdateHarvestLotDto } from "./harvest.dto";
import { HarvestService } from "./harvest.service";

@Controller("harvest")
export class HarvestController extends CrudController("harvest", CreateHarvestLotDto, UpdateHarvestLotDto) {
  constructor(private readonly harvestService: HarvestService) {
    super(harvestService);
  }

  @Get(":id/items")
  async getItems(@Param("id", ParseIntPipe) id: number) {
    return { data: await this.harvestService.getItems(id) };
  }

  @Post(":id/generate-items")
  async generateItems(@Param("id", ParseIntPipe) id: number, @Body() dto: GenerateItemsDto) {
    return { data: await this.harvestService.generateItems(id, dto) };
  }
}
