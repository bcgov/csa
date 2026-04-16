export const CRA_DATA_HANDLING_CONSTANT = {
  DESTINATION_ID: 'cra',
  RESPONSE_FILE_TYPE: {
    RSP: 'RSP',
    WKL: 'WKL',
    MRR: 'MRR',
    MTC: 'MTC',
  },
  LOCAL_DIR: {
    INBOUND: 'inbound',
    OUTBOUND: 'outbound',
  },
  FILE_DIRECTION: {
    INBOUND: 'INBOUND',
    OUTBOUND: 'OUTBOUND',
  },
  UPDATED_BY: {
    SYSTEM: 'SYSTEM',
  },

  REQUEST_FILE: {
    HEADER_TRAN_CODE: 6133,
    DETAIL_TRAN_CODE: 6134,
    TRAILER_TRAN_CODE: 6135,
    HEADER_RECORD_CONT: '00000000',
    VERSION_NUM: 'V00.0',
  },
  RESPONSE_FILE: {
    HEADER_TRAN_CODE: 6118,
    DETAILS_TRAN_CODE: 6119,
    TRAILER_TRAN_CODE: 6120,
  },
  WEEKLY_FILE: {
    HEADER_TRAN_CODE: '6136',
    DETAILS_TRAN_CODE: '6137',
    TRAILER_TRAN_CODE: '6138',
    RECORD_TYPE_CODE: {
      HEADER_RECORD: '613600',
      BLANK_LINE: '613700',
      REPORT_TITLE_RECORD: '613701',
      REPORT_DATE_RANGE_RECORD: '613702',
      COLUMN_HEADING: '613703',
      DATA_RECORD: '613704',
      TRAILER_MESSAGE: '613705',
      TRAILER_RECORD: '613800',
    },
    RECEIVE_MODE: {
      ELECTQRONIC: 'E',
      PAPER: ' ',
    },
  },
  // CRA spec: fileStatCd is 9(02). 2-digit zero-padded string
  FILE_STAT_CODE: {
    FILE_NOT_SET: '00',
    FILE_OK: '01',
    INVALID_EMPTY_FILE: '90',
    INVALID_RECORD_COUNT: '91',
    INVALID_NO_HEADER: '92',
    INVALID_NO_TRAILER: '93',
    INVALID_NO_DETAILS: '94',
    RECS_OUT_OF_SEQ: '95',
  },
  // CRA spec: tranStatCd is 9(01). 1-digit string
  TRAN_STAT_CODE: {
    TRAN_NOT_SET: '0',
    TRAN_ACCEPTED: '1',
    TRAN_REJECTED: '2',
    TRAN_RECYCLED: '3',
    PROBLEM_DETECTED: '4',
  },
  ERROR_MESSAGE: {
    FILE_STAT_MESSAGE: {
      '00': 'FILE NOT SET',
      '01': 'FILE OK',
      '90': 'INVALID EMPTY FILE',
      '91': 'INVALID RECORD COUNT',
      '92': 'INVALID NO HEADER',
      '93': 'INVALID NO TRAILER',
      '94': 'INVALID NO DETAILS',
      '95': 'RECS OUT OF SEQ',
    },
    TRAN_STAT_MESSAGE: {
      '0': 'Transaction Not Set',
      '1': 'Transaction Accepted',
      '2': 'Transaction Rejected',
      '3': 'Transaction Recycled',
      '4': 'Problem Detected',
    },
    REJECT_CODE: {
      '001':
        'You are not authorized to use this service. Please contact your Canada Revenue Agency tax centre.',
      '002':
        'You are not authorized to submit transactions for this Business Number. Please contact your Canada Revenue Agency tax centre.',
      '005':
        'This transaction has already been submitted. Please contact your Canada Revenue Agency tax centre.',
      '006': 'The application or cancellation indicator must be entered.',
      '007': "The child's first name must be entered.",
      '008': "The child's last name must be entered.",
      '009': "The child's sex code must be entered.",
      '010': "The child's birth date must be entered.",
      '011': "The child's birth city must be entered.",
      '012':
        "When a child is born in Canada, the child's province or territory of birth must be entered.",
      '013': "The child's country of birth must be entered.",
      '014': 'The application or cancellation indicator is invalid.',
      '015': "Invalid characters in the child's first name field.",
      '016': "Invalid characters in the child's last name field.",
      '017': "Invalid character in the child's sex code field.",
      '018': "Child's date of birth is invalid.",
      '019': "Invalid characters in the child's birth city field.",
      '020': "Invalid characters in the child's province or territory of birth field.",
      '021': "Invalid characters in the child's country of birth field.",
      '022': "The child's identification information is either incomplete or invalid.",
      '024':
        'When submitting an application the date your agency started to maintain the child must be completed.',
      '025':
        'When submitting a cancellation the date and the reason that your agency ceased to maintain the child must be completed.',
      '026':
        'When submitting an application the ceased to maintain date and the reason code fields should be left blank.',
      '027':
        'When submitting a cancellation the started to maintain date field should be left blank.',
      '028': 'Invalid character in the newborn indicator.',
      '029':
        'When the child is one year of age or older, the child is no longer considered a newborn.',
      '030': "Invalid characters in the dependant's identification number.",
      '031': 'Invalid characters in the date your agency started to maintain the child.',
      '032': 'Invalid characters in the date your agency ceased to maintain the child.',
      '033': 'Invalid characters in the reason your agency ceased to maintain the child.',
      '034': "An application should only be submitted once the child is in your agency's care.",
      '035': 'An application should only be submitted after the child is born.',
      '036': 'You cannot apply for a child that is 18 years of age or older.',
      '037': 'A newborn child cannot have a Dependant Identification Number.',
      '038':
        "A cancellation should only be submitted once the child is no longer in your agency's care.",
      '039': "The date the agency ceased to maintain the child is before the child's birth date.",
      '040':
        'The payments for this child automatically cease in the month after the child turns 18.',
      '041': 'A cancellation form cannot be submitted for a newborn child.',
      '043': 'Child found on the database, but the current Caregiver is not the Applicant.',
      '998': 'The transaction is being recycled. It will be processed in the next scheduled run.',
      '999': 'Transaction has been recycled too many times. Please call support.',
    },
  },
  FILE_TRANSFER_STATUS: {
    COMPLETED: 'COMPLETED',
    PENDING: 'PENDING',
  },
} as const
