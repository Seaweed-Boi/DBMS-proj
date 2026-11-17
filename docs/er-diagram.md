# Entity–Relationship Model


- `PK` = primary key, `FK` = foreign key, `UK` = unique.
- `CENTRE_INVENTORY` is the associative entity that resolves RELIEF_CENTRE M:N RESOURCE_ITEM.
- `VOLUNTEER_PROFILE` is a 1:1 ISA specialisation of `USER` (`volunteer_id` is both PK and FK).
- `ALLOCATION_BATCH` is an implementation table. It is a weak entity of `RESOURCE_ALLOCATION`
  and records which FEFO batches supplied each allocation.

```mermaid
erDiagram
    USERS ||--o{ RELIEF_CENTRES        : "manages (1:N)"
    USERS ||--o{ RELIEF_REQUESTS       : "submits (1:N)"
    USERS ||--o{ RESOURCE_ALLOCATIONS  : "approves (1:N)"
    USERS ||--o| VOLUNTEER_PROFILES    : "ISA (1:1)"
    USERS |o--o{ INVENTORY_AUDIT_LOG   : "changed_by (1:N)"

    DISASTERS ||--|{ AFFECTED_ZONES    : "impacts (1:N, total)"
    AFFECTED_ZONES ||--o{ RELIEF_REQUESTS : "raises (1:N)"
    AFFECTED_ZONES |o--o{ VOLUNTEER_PROFILES : "deployed to (0..1:N)"

    RELIEF_CENTRES ||--o{ CENTRE_INVENTORY     : "stocks"
    RESOURCE_ITEMS ||--o{ CENTRE_INVENTORY     : "held as"
    RELIEF_CENTRES ||--o{ RESOURCE_ALLOCATIONS : "fulfils (1:N)"
    RELIEF_CENTRES |o--o{ VOLUNTEER_PROFILES   : "stationed at (0..1:N)"

    RESOURCE_CATEGORIES ||--|{ RESOURCE_ITEMS  : "classifies (1:N)"
    RESOURCE_ITEMS ||--o{ RELIEF_REQUESTS      : "requested (1:N)"
    RESOURCE_ITEMS ||--o{ RESOURCE_ALLOCATIONS : "allocated (1:N)"

    RELIEF_REQUESTS ||--o{ RESOURCE_ALLOCATIONS : "fulfilled by (1:N)"
    RESOURCE_ALLOCATIONS ||--|{ ALLOCATION_BATCHES : "drawn from"
    CENTRE_INVENTORY ||--o{ ALLOCATION_BATCHES   : "supplies"
    CENTRE_INVENTORY ||--o{ INVENTORY_AUDIT_LOG  : "audited (1:N)"

    USERS {
        int user_id PK
        varchar full_name
        varchar email UK
        text password_hash
        varchar phone
        varchar role "ADMIN|CENTRE_MANAGER|COORDINATOR|VOLUNTEER"
        timestamp created_at
    }
    DISASTERS {
        int disaster_id PK
        varchar title
        varchar disaster_type
        varchar severity_level
        date start_date
        varchar status
        text description
    }
    AFFECTED_ZONES {
        int zone_id PK
        int disaster_id FK
        varchar zone_name
        varchar district
        decimal latitude
        decimal longitude
        int affected_population
        decimal urgency_score
        varchar status
    }
    RELIEF_CENTRES {
        int centre_id PK
        int manager_id FK
        varchar centre_name UK
        text address
        varchar district
        int total_capacity
        int current_occupancy
        varchar contact_phone
        boolean is_active
    }
    RESOURCE_CATEGORIES {
        int category_id PK
        varchar category_name UK
        varchar unit_of_measure
        boolean is_perishable
    }
    RESOURCE_ITEMS {
        int item_id PK
        int category_id FK
        varchar item_name
        varchar sku UK
        text description
    }
    CENTRE_INVENTORY {
        int inventory_id PK
        int centre_id FK
        int item_id FK
        int quantity_available
        int quantity_reserved
        int reorder_threshold
        date expiry_date "UK(centre_id, item_id, expiry_date)"
        timestamp last_updated
    }
    RELIEF_REQUESTS {
        int request_id PK
        int zone_id FK
        int requested_by FK
        int item_id FK
        int quantity_requested
        int quantity_fulfilled
        varchar urgency_level
        text notes
        varchar status
        timestamp created_at
    }
    RESOURCE_ALLOCATIONS {
        int allocation_id PK
        int request_id FK
        int centre_id FK
        int item_id FK
        int approved_by FK
        int quantity_allocated
        varchar dispatch_status
        timestamp allocated_at
        timestamp delivered_at
    }
    ALLOCATION_BATCHES {
        int allocation_id PK,FK
        int inventory_id PK,FK
        int quantity
    }
    VOLUNTEER_PROFILES {
        int volunteer_id PK,FK
        varchar primary_skill
        varchar availability_status
        int assigned_centre_id FK
        int assigned_zone_id FK
    }
    INVENTORY_AUDIT_LOG {
        int log_id PK
        int inventory_id FK
        int changed_by FK
        varchar change_type
        int quantity_delta
        timestamp logged_at
    }
```

## Chen-notation drawing checklist (§6.3 diagramming note)

<img width="1217" height="1072" alt="image" src="CHEND.png" />

