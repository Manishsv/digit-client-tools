/** Sample YAML aligned with digit-cli / digit3 provision examples */

export const EXAMPLE_BOUNDARIES = `boundary:
  - code: "WARD-001"
    geometry:
      type: "Polygon"
      coordinates:
        - - [77.0, 28.5]
          - [77.1, 28.5]
          - [77.1, 28.6]
          - [77.0, 28.6]
          - [77.0, 28.5]
    additionalDetails: {}
  - code: "WARD-002"
    geometry:
      type: "Point"
      coordinates: [77.05, 28.55]
    additionalDetails: {}
`;

export const EXAMPLE_CORE_REGISTRY = `schemaCode: "core.facility"
definition:
  $schema: "https://json-schema.org/draft/2020-12/schema"
  type: "object"
  additionalProperties: false
  properties:
    facilityCode:
      type: "string"
    facilityName:
      type: "string"
    tenantId:
      type: "string"
    active:
      type: "boolean"
  required: ["facilityCode", "facilityName", "tenantId"]
`;

export const EXAMPLE_CASE_REGISTRY = `schemaCode: "complaints.case"
definition:
  $schema: "https://json-schema.org/draft/2020-12/schema"
  type: "object"
  additionalProperties: false
  properties:
    serviceRequestId:
      type: "string"
    tenantId:
      type: "string"
    serviceCode:
      type: "string"
    description:
      type: "string"
    boundaryCode:
      type: "string"
    applicationStatus:
      type: "string"
    processId:
      type: "string"
    workflowInstanceId:
      type: "string"
    fileStoreId:
      type: "string"
  required: ["serviceRequestId", "tenantId", "serviceCode"]
`;

export const EXAMPLE_MDMS_SCHEMA = `schema:
  code: "complaint.types"
  description: "Complaint type master"
  isActive: true
  definition:
    $schema: "http://json-schema.org/draft-07/schema#"
    type: "object"
    required: ["label", "severity"]
    x-unique:
      - "label"
    properties:
      label:
        type: "string"
      severity:
        type: "string"
        enum: ["LOW", "MEDIUM", "HIGH"]
`;

export const EXAMPLE_MDMS_DATA = `mdms:
  - schemaCode: "complaint.types"
    uniqueIdentifier: "NOISE"
    data:
      label: "Noise complaint"
      severity: "MEDIUM"
    isActive: true
  - schemaCode: "complaint.types"
    uniqueIdentifier: "WATER"
    data:
      label: "Water supply"
      severity: "HIGH"
    isActive: true
`;

/** Truncated PGR67-style workflow — load full file from digit-cli/example-workflow.yaml for production */
export const EXAMPLE_WORKFLOW = `workflow:
  process:
    name: "Complaint processing"
    code: "PGR67"
    description: "Maker-checker style"
    version: "1.0"
    sla: 86400
  states:
    - code: "INIT"
      name: "Init"
      isInitial: true
      isParallel: false
      isJoin: false
      sla: 86400
    - code: "PENDINGFORASSIGNMENT"
      name: "Pending assignment"
      isInitial: false
      isParallel: false
      isJoin: false
      sla: 43200
    - code: "PENDINGATLME"
      name: "With LME"
      isInitial: false
      isParallel: false
      isJoin: false
      sla: 43200
    - code: "RESOLVED"
      name: "Resolved"
      isInitial: false
      isParallel: false
      isJoin: false
      sla: 43200
    - code: "CLOSEDAFTERRESOLUTION"
      name: "Closed"
      isInitial: false
      isParallel: false
      isJoin: false
      sla: 0
  actions:
    - name: "APPLY"
      currentState: "INIT"
      nextState: "PENDINGFORASSIGNMENT"
      attributeValidation:
        attributes:
          roles: ["CITIZEN", "CSR"]
    - name: "ASSIGN"
      currentState: "PENDINGFORASSIGNMENT"
      nextState: "PENDINGATLME"
      attributeValidation:
        attributes:
          roles: ["GRO"]
    - name: "RESOLVE"
      currentState: "PENDINGATLME"
      nextState: "RESOLVED"
      attributeValidation:
        attributes:
          roles: ["LME"]
    - name: "RATE"
      currentState: "RESOLVED"
      nextState: "CLOSEDAFTERRESOLUTION"
      attributeValidation:
        attributes:
          roles: ["CITIZEN", "CSR"]
`;
