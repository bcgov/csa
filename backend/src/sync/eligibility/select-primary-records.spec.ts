import { describe, expect, it } from 'vitest'
import { selectPrimaryRecords } from './eligibility.service'
import { makeContact as makeProfile, makePlacement, makeOrder, makeAgreement } from './test-helpers'

describe('selectPrimaryRecords', () => {
  describe('placement priority', () => {
    it('returns null when no placements exist', () => {
      const result = selectPrimaryRecords(makeProfile())
      expect(result.primaryPlacement).toBeNull()
      expect(result.primaryOrder).toBeNull()
      expect(result.primaryAgreement).toBeNull()
    })

    it('selects ICM Placement over all others', () => {
      const icmPlacement = makePlacement({
        source: 'ICM',
        type: 'Placement',
        placementNumber: 'ICM-PL',
      })
      const icmNonPlacement = makePlacement({
        source: 'ICM',
        type: 'Non-Placement Location',
        placementNumber: 'ICM-NPL',
      })
      const misPlacement = makePlacement({
        source: 'MIS',
        type: 'Placement',
        placementNumber: 'MIS-PL',
      })
      const misNonPlacement = makePlacement({
        source: 'MIS',
        type: 'Non-Placement Location',
        placementNumber: 'MIS-NPL',
      })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [misNonPlacement, misPlacement, icmNonPlacement, icmPlacement] }),
      )
      expect(result.primaryPlacement!.placementNumber).toBe('ICM-PL')
    })

    it('falls back to ICM Non-Placement when no ICM Placement exists', () => {
      const icmNonPlacement = makePlacement({
        source: 'ICM',
        type: 'Non-Placement Location',
        placementNumber: 'ICM-NPL',
      })
      const misPlacement = makePlacement({
        source: 'MIS',
        type: 'Placement',
        placementNumber: 'MIS-PL',
      })
      const misNonPlacement = makePlacement({
        source: 'MIS',
        type: 'Non-Placement Location',
        placementNumber: 'MIS-NPL',
      })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [misNonPlacement, misPlacement, icmNonPlacement] }),
      )
      expect(result.primaryPlacement!.placementNumber).toBe('ICM-NPL')
    })

    it('falls back to MIS Placement when no ICM records exist', () => {
      const misPlacement = makePlacement({
        source: 'MIS',
        type: 'Placement',
        placementNumber: 'MIS-PL',
      })
      const misNonPlacement = makePlacement({
        source: 'MIS',
        type: 'Non-Placement Location',
        placementNumber: 'MIS-NPL',
      })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [misNonPlacement, misPlacement] }),
      )
      expect(result.primaryPlacement!.placementNumber).toBe('MIS-PL')
    })

    it('falls back to MIS Non-Placement as last resort', () => {
      const misNonPlacement = makePlacement({
        source: 'MIS',
        type: 'Non-Placement Location',
        placementNumber: 'MIS-NPL',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [misNonPlacement] }))
      expect(result.primaryPlacement!.placementNumber).toBe('MIS-NPL')
    })

    it('prefers Active over Ended placement', () => {
      const ended = makePlacement({
        source: 'ICM',
        type: 'Placement',
        status: 'Ended',
        placementNumber: 'ENDED',
      })
      const active = makePlacement({
        source: 'MIS',
        type: 'Non-Placement Location',
        status: 'Active',
        placementNumber: 'ACTIVE',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [ended, active] }))
      expect(result.primaryPlacement!.placementNumber).toBe('ACTIVE')
    })

    it('prefers Active over Interrupted', () => {
      const interrupted = makePlacement({
        source: 'ICM',
        type: 'Placement',
        status: 'Interrupted',
        placementNumber: 'INT',
      })
      const active = makePlacement({
        source: 'MIS',
        type: 'Non-Placement Location',
        status: 'Active',
        placementNumber: 'ACTIVE',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [interrupted, active] }))
      expect(result.primaryPlacement!.placementNumber).toBe('ACTIVE')
    })

    it('prefers Interrupted over Ended', () => {
      const ended = makePlacement({
        source: 'ICM',
        type: 'Placement',
        status: 'Ended',
        placementNumber: 'ENDED',
      })
      const interrupted = makePlacement({
        source: 'MIS',
        type: 'Non-Placement Location',
        status: 'Interrupted',
        placementNumber: 'INT',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [ended, interrupted] }))
      expect(result.primaryPlacement!.placementNumber).toBe('INT')
    })

    it('includes Interrupted status placements', () => {
      const interrupted = makePlacement({
        source: 'ICM',
        type: 'Placement',
        status: 'Interrupted',
        placementNumber: 'INT',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [interrupted] }))
      expect(result.primaryPlacement!.placementNumber).toBe('INT')
    })

    it('falls back to Ended/Closed and picks latest by endDate', () => {
      const older = makePlacement({
        source: 'ICM',
        type: 'Placement',
        status: 'Ended',
        endDate: new Date('2026-01-10'),
        placementNumber: 'OLDER',
      })
      const newer = makePlacement({
        source: 'MIS',
        type: 'Placement',
        status: 'Closed',
        endDate: new Date('2026-01-20'),
        placementNumber: 'NEWER',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [older, newer] }))
      expect(result.primaryPlacement!.placementNumber).toBe('NEWER')
    })

    it('prefers ICM over MIS when Ended/Closed placements have same endDate', () => {
      const misPlacement = makePlacement({
        source: 'MIS',
        type: 'Placement',
        status: 'Closed',
        endDate: new Date('2026-01-20'),
        placementNumber: 'MIS-ENDED',
      })
      const icmPlacement = makePlacement({
        source: 'ICM',
        type: 'Placement',
        status: 'Ended',
        endDate: new Date('2026-01-20'),
        placementNumber: 'ICM-ENDED',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [misPlacement, icmPlacement] }))
      expect(result.primaryPlacement!.placementNumber).toBe('ICM-ENDED')
    })

    it('handles case-insensitive type and status matching', () => {
      const placement = makePlacement({
        source: 'ICM',
        type: '  placement  ',
        status: '  active  ',
        placementNumber: 'TRIMMED',
      })

      const result = selectPrimaryRecords(makeProfile({ placements: [placement] }))
      expect(result.primaryPlacement!.placementNumber).toBe('TRIMMED')
    })
  })

  describe('order matching', () => {
    it('matches ICM order via agreementRowId', () => {
      const placement = makePlacement({ source: 'ICM', agreementRowId: 'AGR-1' })
      const matchingOrder = makeOrder({
        source: 'ICM',
        agreementRowId: 'AGR-1',
        orderNumber: 'MATCH',
      })
      const otherOrder = makeOrder({ source: 'ICM', agreementRowId: 'AGR-2', orderNumber: 'OTHER' })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [placement], orders: [otherOrder, matchingOrder] }),
      )
      expect(result.primaryOrder!.orderNumber).toBe('MATCH')
    })

    it('matches MIS order via contractNumber', () => {
      const placement = makePlacement({ source: 'MIS', type: 'Placement', contractNumber: 'CON-1' })
      const matchingOrder = makeOrder({
        source: 'MIS',
        contractNumber: 'CON-1',
        orderNumber: 'MATCH',
      })
      const icmOrder = makeOrder({
        source: 'ICM',
        contractNumber: 'CON-1',
        orderNumber: 'ICM-ORDER',
      })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [placement], orders: [icmOrder, matchingOrder] }),
      )
      expect(result.primaryOrder!.orderNumber).toBe('MATCH')
    })

    it('returns null order when no link key on placement', () => {
      const placement = makePlacement({ source: 'ICM', agreementRowId: null })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [placement], orders: [makeOrder()] }),
      )
      expect(result.primaryOrder).toBeNull()
    })
  })

  describe('agreement matching', () => {
    it('matches ICM agreement via agreementRowId', () => {
      const placement = makePlacement({ source: 'ICM', agreementRowId: 'AGR-1' })
      const matching = makeAgreement({ source: 'ICM', rowId: 'AGR-1', agreementType: 'MATCH' })
      const other = makeAgreement({ source: 'ICM', rowId: 'AGR-2', agreementType: 'OTHER' })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [placement], agreements: [other, matching] }),
      )
      expect(result.primaryAgreement!.agreementType).toBe('MATCH')
    })

    it('matches MIS contract via contractNumber', () => {
      const placement = makePlacement({ source: 'MIS', type: 'Placement', contractNumber: 'CON-1' })
      const matching = makeAgreement({
        source: 'MIS',
        contractNumber: 'CON-1',
        agreementType: 'MATCH',
      })
      const icmAgreement = makeAgreement({
        source: 'ICM',
        contractNumber: 'CON-1',
        agreementType: 'ICM',
      })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [placement], agreements: [icmAgreement, matching] }),
      )
      expect(result.primaryAgreement!.agreementType).toBe('MATCH')
    })

    it('returns null agreement when no link key on placement', () => {
      const placement = makePlacement({ source: 'MIS', type: 'Placement', contractNumber: null })

      const result = selectPrimaryRecords(
        makeProfile({ placements: [placement], agreements: [makeAgreement()] }),
      )
      expect(result.primaryAgreement).toBeNull()
    })
  })

  describe('end-to-end: placement drives order and agreement selection', () => {
    it('selects ICM order/agreement when ICM placement wins', () => {
      const icmPlacement = makePlacement({
        source: 'ICM',
        type: 'Placement',
        agreementRowId: 'AGR-ICM',
      })
      const misPlacement = makePlacement({
        source: 'MIS',
        type: 'Placement',
        contractNumber: 'CON-MIS',
      })
      const icmOrder = makeOrder({
        source: 'ICM',
        agreementRowId: 'AGR-ICM',
        orderNumber: 'ICM-ORD',
      })
      const misOrder = makeOrder({
        source: 'MIS',
        contractNumber: 'CON-MIS',
        orderNumber: 'MIS-ORD',
      })
      const icmAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-ICM',
        agreementType: 'ICM-AGR',
      })
      const misAgreement = makeAgreement({
        source: 'MIS',
        contractNumber: 'CON-MIS',
        agreementType: 'MIS-AGR',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          placements: [misPlacement, icmPlacement],
          orders: [misOrder, icmOrder],
          agreements: [misAgreement, icmAgreement],
        }),
      )

      expect(result.primaryPlacement!.source).toBe('ICM')
      expect(result.primaryOrder!.orderNumber).toBe('ICM-ORD')
      expect(result.primaryAgreement!.agreementType).toBe('ICM-AGR')
    })

    it('selects MIS order/agreement when MIS placement wins (no ICM)', () => {
      const misPlacement = makePlacement({
        source: 'MIS',
        type: 'Placement',
        contractNumber: 'CON-MIS',
      })
      const misOrder = makeOrder({
        source: 'MIS',
        contractNumber: 'CON-MIS',
        orderNumber: 'MIS-ORD',
      })
      const misAgreement = makeAgreement({
        source: 'MIS',
        contractNumber: 'CON-MIS',
        agreementType: 'MIS-AGR',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          placements: [misPlacement],
          orders: [misOrder],
          agreements: [misAgreement],
        }),
      )

      expect(result.primaryPlacement!.source).toBe('MIS')
      expect(result.primaryOrder!.orderNumber).toBe('MIS-ORD')
      expect(result.primaryAgreement!.agreementType).toBe('MIS-AGR')
    })

    it('selects ICM non-placement with linked order/agreement over MIS placement', () => {
      const icmNonPlacement = makePlacement({
        source: 'ICM',
        type: 'Non-Placement Location',
        agreementRowId: 'AGR-ICM',
      })
      const misPlacement = makePlacement({
        source: 'MIS',
        type: 'Placement',
        contractNumber: 'CON-MIS',
      })
      const icmOrder = makeOrder({
        source: 'ICM',
        agreementRowId: 'AGR-ICM',
        orderNumber: 'ICM-ORD',
      })
      const icmAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-ICM',
        agreementType: 'ICM-AGR',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          placements: [misPlacement, icmNonPlacement],
          orders: [icmOrder],
          agreements: [icmAgreement],
        }),
      )

      expect(result.primaryPlacement!.source).toBe('ICM')
      expect(result.primaryPlacement!.type).toBe('Non-Placement Location')
      expect(result.primaryOrder!.orderNumber).toBe('ICM-ORD')
      expect(result.primaryAgreement!.agreementType).toBe('ICM-AGR')
    })
  })

  describe('OOC (OPC/OPO/OPT)', () => {
    const referenceDate = new Date('2026-05-15T12:00:00Z')

    it('returns blank placement and active ICM agreement for OPC child', () => {
      const placement = makePlacement({
        source: 'ICM',
        type: 'Placement',
        placementNumber: 'SHOULD-NOT-SHOW',
        agreementRowId: 'AGR-OTHER',
      })
      const activeAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-OOC',
        agreementStatus: 'Active',
        agreementType: 'Out of Care',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          misLegalAuthCode: 'OPC',
          placements: [placement],
          agreements: [activeAgreement],
        }),
        referenceDate,
      )

      expect(result.primaryPlacement).toBeNull()
      expect(result.primaryAgreement!.rowId).toBe('AGR-OOC')
      expect(result.primaryAgreement!.agreementType).toBe('Out of Care')
      expect(result.primaryOrder).toBeNull()
    })

    it('returns previous-month closed ICM order linked to active agreement', () => {
      const activeAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-OOC',
        agreementStatus: 'Active',
        agreementType: 'Out of Care',
      })
      const closedOrder = makeOrder({
        source: 'ICM',
        agreementRowId: 'AGR-OOC',
        orderStatus: 'Closed',
        orderNumber: 'ORD-APR',
        effectiveStartDate: new Date('2026-04-10T00:00:00Z'),
        product: 'Monthly Rate',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          misLegalAuthCode: 'OPO',
          agreements: [activeAgreement],
          orders: [closedOrder],
        }),
        referenceDate,
      )

      expect(result.primaryPlacement).toBeNull()
      expect(result.primaryOrder!.orderNumber).toBe('ORD-APR')
      expect(result.primaryOrder!.product).toBe('Monthly Rate')
    })

    it('returns latest end date OOC agreement when no active agreement exists', () => {
      const olderAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-OLD',
        agreementStatus: 'Inactive',
        agreementType: 'Out of Care',
        agreementEndDate: new Date('2026-01-01T00:00:00Z'),
      })
      const newerAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-NEW',
        agreementStatus: 'Inactive',
        agreementType: 'Out of Care',
        agreementEndDate: new Date('2026-06-01T00:00:00Z'),
      })

      const result = selectPrimaryRecords(
        makeProfile({
          misLegalAuthCode: 'OPT',
          agreements: [olderAgreement, newerAgreement],
        }),
        referenceDate,
      )

      expect(result.primaryPlacement).toBeNull()
      expect(result.primaryAgreement!.rowId).toBe('AGR-NEW')
      expect(result.primaryOrder).toBeNull()
    })

    it('returns blank agreement when no Out of Care agreements exist', () => {
      const fchAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-FCH',
        agreementStatus: 'Active',
        agreementType: 'FCH',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          misLegalAuthCode: 'OPT',
          agreements: [fchAgreement],
        }),
        referenceDate,
      )

      expect(result.primaryPlacement).toBeNull()
      expect(result.primaryAgreement).toBeNull()
      expect(result.primaryOrder).toBeNull()
    })

    it('treats whitespace MIS legal codes as OOC', () => {
      const activeAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-OOC',
        agreementStatus: 'Active',
        agreementType: 'Out of Care',
      })

      const result = selectPrimaryRecords(
        makeProfile({ misLegalAuthCode: ' opc ', agreements: [activeAgreement] }),
        referenceDate,
      )

      expect(result.primaryPlacement).toBeNull()
      expect(result.primaryAgreement!.rowId).toBe('AGR-OOC')
    })

    it('picks highest-amount closed order when multiple exist in previous month', () => {
      const activeAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-OOC',
        agreementStatus: 'Active',
        agreementType: 'Out of Care',
      })
      const lowerAmountOrder = makeOrder({
        source: 'ICM',
        agreementRowId: 'AGR-OOC',
        orderStatus: 'Closed',
        orderNumber: 'ORD-LOW',
        amount: 1200,
        effectiveStartDate: new Date('2026-04-05T00:00:00Z'),
        product: 'Lower Rate',
      })
      const higherAmountOrder = makeOrder({
        source: 'ICM',
        agreementRowId: 'AGR-OOC',
        orderStatus: 'Closed',
        orderNumber: 'ORD-HIGH',
        amount: 2400,
        effectiveStartDate: new Date('2026-04-20T00:00:00Z'),
        product: 'Higher Rate',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          misLegalAuthCode: 'OPC',
          agreements: [activeAgreement],
          orders: [lowerAmountOrder, higherAmountOrder],
        }),
        referenceDate,
      )

      expect(result.primaryOrder!.orderNumber).toBe('ORD-HIGH')
      expect(result.primaryOrder!.product).toBe('Higher Rate')
    })

    it('does not pick closed order outside previous month', () => {
      const activeAgreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-OOC',
        agreementStatus: 'Active',
        agreementType: 'Out of Care',
      })
      const currentMonthOrder = makeOrder({
        source: 'ICM',
        agreementRowId: 'AGR-OOC',
        orderStatus: 'Closed',
        effectiveStartDate: new Date('2026-05-02T00:00:00Z'),
      })

      const result = selectPrimaryRecords(
        makeProfile({
          misLegalAuthCode: 'OPC',
          agreements: [activeAgreement],
          orders: [currentMonthOrder],
        }),
        referenceDate,
      )

      expect(result.primaryOrder).toBeNull()
    })

    it('does not treat non-OOC legal codes as OOC', () => {
      const placement = makePlacement({
        source: 'ICM',
        type: 'Placement',
        agreementRowId: 'AGR-1',
        placementNumber: 'PL-1',
      })
      const agreement = makeAgreement({
        source: 'ICM',
        rowId: 'AGR-1',
        agreementStatus: 'Active',
      })

      const result = selectPrimaryRecords(
        makeProfile({
          misLegalAuthCode: 'OTHER',
          effectiveLegalStatus: 'OPC',
          placements: [placement],
          agreements: [agreement],
        }),
        referenceDate,
      )

      expect(result.primaryPlacement!.placementNumber).toBe('PL-1')
      expect(result.primaryAgreement!.rowId).toBe('AGR-1')
    })
  })
})
