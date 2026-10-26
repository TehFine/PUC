import { Body, Controller, Get, HttpCode, Ip, Post, Query } from "@nestjs/common";
import type { FeatureCollection } from "geojson";
import { AuditService } from "../audit/audit.service";
import type { AuthUser } from "../auth/auth-user";
import { Authorize, CurrentUser } from "../auth/auth.decorators";
import { lenientPipe } from "../common/pipes/validation.pipes";
import { CreateMeasurementDto, CreatePlotDto } from "./dto/plot.dto";
import { PlotInputError, PlotsService } from "./plots.service";
import type { MeasurementInput } from "./plot.types";

interface ImportBody {
  collection?: FeatureCollection;
  sourceRef?: string;
}

@Controller("plots")
export class PlotsController {
  constructor(
    private readonly plots: PlotsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Authorize("plots", "read")
  list() {
    return this.plots.listPlots();
  }

  @Post()
  @Authorize("plots", "create")
  async create(@Body(lenientPipe(CreatePlotDto)) dto: CreatePlotDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    const result = await this.plots.createPlot(dto);
    await this.audit.write({ ip, user }, { action: "Tạo mới", object: `Thửa đất ${result.feature.properties.code}` });
    return result;
  }

  /** Nhập GeoJSON địa chính: body là FeatureCollection tùy ý (có thể rất lớn) nên được kiểm tra trong service. */
  @Post("import")
  @HttpCode(200)
  @Authorize("plots", "create")
  async importCadastral(@Body() body: ImportBody | FeatureCollection | null, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    const wrapped = body as ImportBody | null;
    const collection = wrapped?.collection ?? (body as FeatureCollection | null);
    if (!collection || collection.type !== "FeatureCollection") {
      throw new PlotInputError("Tệp phải là GeoJSON FeatureCollection.");
    }
    const sourceRef = wrapped?.sourceRef;
    const result = await this.plots.importCadastral(collection, sourceRef);
    await this.audit.write(
      { ip, user },
      {
        action: "Nhập dữ liệu",
        object: `Địa chính ${sourceRef ?? ""}`.trim(),
        detail: `${result.imported} thửa`,
      },
    );
    return result;
  }

  @Get("measurements")
  @Authorize("plot-measurements", "read")
  async listMeasurements(@Query("plotCode") plotCode?: string) {
    return { measurements: await this.plots.listMeasurements(typeof plotCode === "string" ? plotCode : "") };
  }

  @Post("measurements")
  @Authorize("plot-measurements", "create")
  async addMeasurement(
    @Body(lenientPipe(CreateMeasurementDto)) dto: CreateMeasurementDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    const result = await this.plots.addMeasurement(dto as MeasurementInput);
    await this.audit.write({ ip, user }, { action: "Tạo mới", object: `Kết quả đo ${result.measurement.plotCode}` });
    return result;
  }
}
