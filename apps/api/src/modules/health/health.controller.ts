import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): { status: 'ok'; serverTime: string } {
    return {
      status: 'ok',
      serverTime: new Date().toISOString(),
    };
  }
}
