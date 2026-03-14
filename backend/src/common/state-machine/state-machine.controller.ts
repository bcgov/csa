import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SkipCSACheck } from 'src/api/common/decorators/skip-csa-check.decorator'
import { CSAGuard } from 'src/api/common/guards/csa.guard'
import { CSA_STATUS, CSA_STATUS_LABELS, USER_CSA_EVENTS } from './constants'
import type { StateConfig, Transition } from './interfaces'
import { canTransitionCsa, getNextCsaState } from './machines/csa-status.machine'

@ApiTags('state-machines')
@Controller('state-machines')
@UseGuards(CSAGuard)
@SkipCSACheck()
export class StateMachineController {
  @Get('csa')
  @ApiOperation({ summary: 'Get CSA status configuration for frontend' })
  @ApiResponse({
    status: 200,
    description: 'Returns CSA statuses and user-triggerable transitions',
  })
  getCsaConfig(): StateConfig {
    const transitions: Record<string, Transition[]> = {}

    // For each status, find user-triggerable transitions
    for (const status of Object.values(CSA_STATUS)) {
      const statusTransitions: Transition[] = []

      for (const event of USER_CSA_EVENTS) {
        if (canTransitionCsa(status, event)) {
          const targetState = getNextCsaState(status, event)
          statusTransitions.push({
            event,
            targetState,
          })
        }
      }

      if (statusTransitions.length > 0) {
        transitions[status] = statusTransitions
      }
    }

    return {
      statuses: CSA_STATUS_LABELS,
      transitions,
    }
  }
}
