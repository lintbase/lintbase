# Database Risk & Issues Report

> This report highlights current technical debt, schema drift, and security risks. Agents should avoid perpetuating these issues.

**Risk Score:** 100/100
**Issues:** 14 errors, 32 warnings, 3 infos

## 🔴 Errors
- **[schema/field-type-mismatch]** (`Leads`) Field "stripeAccountInfo" in "Leads" has 2 different types: [map, string].
  - *Fix:* Normalise this field to a single type. Schema drift makes queries unreliable and is hard to fix at scale.
- **[schema/field-type-mismatch]** (`NewTenant`) Field "payload" in "NewTenant" has 2 different types: [null, map].
  - *Fix:* Normalise this field to a single type. Schema drift makes queries unreliable and is hard to fix at scale.
- **[schema/field-type-mismatch]** (`pendingrewal`) Field "proprio" in "pendingrewal" has 2 different types: [null, map].
  - *Fix:* Normalise this field to a single type. Schema drift makes queries unreliable and is hard to fix at scale.
- **[perf/excessive-nesting]** (`Leads`) "Leads" contains documents nested 6 levels deep (recommended max: 5).
  - *Fix:* Flatten deeply nested objects into separate sub-collections or top-level fields. Firestore queries cannot filter or order on nested fields beyond 1 level without composite indexes.
- **[perf/excessive-nesting]** (`pendingrewal`) "pendingrewal" contains documents nested 7 levels deep (recommended max: 5).
  - *Fix:* Flatten deeply nested objects into separate sub-collections or top-level fields. Firestore queries cannot filter or order on nested fields beyond 1 level without composite indexes.
- **[security/sensitive-collection]** (`bankinfo`) Collection "bankinfo" appears to store sensitive data (matched pattern: /^bank/i).
  - *Fix:* Verify that Firestore Security Rules restrict read access to authenticated users only. Consider encrypting sensitive fields at the application layer before writing to Firestore.
- **[security/debug-data-in-production]** (`consoleLog`) Collection "consoleLog" looks like debug or test data left in production (matched pattern: /^console/i).
  - *Fix:* Delete or archive this collection. Debug data in production is a security and cost risk — it may expose internal request/response payloads and accumulates unbounded write costs.
- **[security/debug-data-in-production]** (`requestGet`) Collection "requestGet" looks like debug or test data left in production (matched pattern: /^request(get|post|put|delete|patch)$/i).
  - *Fix:* Delete or archive this collection. Debug data in production is a security and cost risk — it may expose internal request/response payloads and accumulates unbounded write costs.
- **[security/debug-data-in-production]** (`requestPost`) Collection "requestPost" looks like debug or test data left in production (matched pattern: /^request(get|post|put|delete|patch)$/i).
  - *Fix:* Delete or archive this collection. Debug data in production is a security and cost risk — it may expose internal request/response payloads and accumulates unbounded write costs.
- **[security/debug-data-in-production]** (`testPayload`) Collection "testPayload" looks like debug or test data left in production (matched pattern: /^test/i).
  - *Fix:* Delete or archive this collection. Debug data in production is a security and cost risk — it may expose internal request/response payloads and accumulates unbounded write costs.
- **[cost/logging-sink]** (`consoleLog`) "consoleLog" appears to be used as a logging or event sink. Firestore charges per document write — unbounded logging here will compound costs.
  - *Fix:* Use Cloud Logging, BigQuery, or a dedicated logging service instead. If you must use Firestore, implement a TTL cleanup Cloud Function to delete old documents automatically.
- **[cost/logging-sink]** (`requestGet`) "requestGet" appears to be used as a logging or event sink. Firestore charges per document write — unbounded logging here will compound costs.
  - *Fix:* Use Cloud Logging, BigQuery, or a dedicated logging service instead. If you must use Firestore, implement a TTL cleanup Cloud Function to delete old documents automatically.
- **[cost/logging-sink]** (`requestPost`) "requestPost" appears to be used as a logging or event sink. Firestore charges per document write — unbounded logging here will compound costs.
  - *Fix:* Use Cloud Logging, BigQuery, or a dedicated logging service instead. If you must use Firestore, implement a TTL cleanup Cloud Function to delete old documents automatically.
- **[cost/logging-sink]** (`testPayload`) "testPayload" appears to be used as a logging or event sink. Firestore charges per document write — unbounded logging here will compound costs.
  - *Fix:* Use Cloud Logging, BigQuery, or a dedicated logging service instead. If you must use Firestore, implement a TTL cleanup Cloud Function to delete old documents automatically.

## 🟠 Warnings
- **[schema/sparse-field]** (`Immeubles`) Field "buldingID" in "Immeubles" is present in only 1/100 documents (1%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Immeubles`) Field "buildingStackID" in "Immeubles" is present in only 1/100 documents (1%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Leads`) Field "buildingStackListId" in "Leads" is present in only 3/13 documents (23%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Leads`) Field "buildingStackUserId" in "Leads" is present in only 3/13 documents (23%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Leads`) Field "buldindStackAssosId" in "Leads" is present in only 4/13 documents (31%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Leads`) Field "business" in "Leads" is present in only 1/13 documents (8%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Leads`) Field "nom" in "Leads" is present in only 1/13 documents (8%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Leads`) Field "prenom" in "Leads" is present in only 1/13 documents (8%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "zipCode" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "address" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "streetNumber" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "buildingCode" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "codePostal" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "streetName" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "name" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "addressLocation" in "Membres" is present in only 13/53 documents (25%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`Membres`) Field "dateAssemblee" in "Membres" is present in only 2/53 documents (4%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/high-field-variance]** (`Membres`) Documents in "Membres" have between 12 and 21 fields — high structural variance.
  - *Fix:* High field variance is a sign of schema drift over time. Consider a migration or schema validation layer.
- **[schema/sparse-field]** (`releve`) Field "kohl" in "releve" is present in only 1/7 documents (14%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`releve`) Field "mom;" in "releve" is present in only 1/7 documents (14%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`releve`) Field "kjk" in "releve" is present in only 1/7 documents (14%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`releve`) Field "mlml" in "releve" is present in only 1/7 documents (14%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`releve`) Field "knljkn" in "releve" is present in only 1/7 documents (14%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`releve`) Field "ski" in "releve" is present in only 1/7 documents (14%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[schema/sparse-field]** (`supportForm`) Field "message" in "supportForm" is present in only 1/6 documents (17%).
  - *Fix:* Consider adding a default value or marking it as optional in your application model to prevent runtime null errors.
- **[security/stub-auth-collection]** (`Users`) "Users" looks like an auth/user collection but contains very few, tiny documents (1 docs, avg 2 bytes). It may be a stub or orphaned.
  - *Fix:* Confirm whether user data is stored here or in Firebase Auth. Orphaned collections should be removed to avoid confusing security rule coverage.
- **[cost/large-avg-document]** (`stake`) "stake" average document size is 8.2 KB.
  - *Fix:* Consider splitting large documents or using sub-collections for frequently-updated sub-objects.
- **[cost/redundant-collections]** (`Baux`) Collections ["Baux", "NewTenant", "request"] have identical average document sizes and nesting depth — they likely store the same schema.
  - *Fix:* Merge redundant collections into one, using a "type" or "method" field to differentiate records. This halves your index count and simplifies security rule maintenance.
- **[cost/redundant-collections]** (`NewTicket`) Collections ["NewTicket", "releve"] have identical average document sizes and nesting depth — they likely store the same schema.
  - *Fix:* Merge redundant collections into one, using a "type" or "method" field to differentiate records. This halves your index count and simplifies security rule maintenance.
- **[cost/redundant-collections]** (`Users`) Collections ["Users", "surveySatisfaction"] have identical average document sizes and nesting depth — they likely store the same schema.
  - *Fix:* Merge redundant collections into one, using a "type" or "method" field to differentiate records. This halves your index count and simplifies security rule maintenance.
- **[cost/redundant-collections]** (`infoskokote`) Collections ["infoskokote", "monthlyreport"] have identical average document sizes and nesting depth — they likely store the same schema.
  - *Fix:* Merge redundant collections into one, using a "type" or "method" field to differentiate records. This halves your index count and simplifies security rule maintenance.
- **[cost/redundant-collections]** (`requestGet`) Collections ["requestGet", "requestPost", "testPayload"] have identical average document sizes and nesting depth — they likely store the same schema.
  - *Fix:* Merge redundant collections into one, using a "type" or "method" field to differentiate records. This halves your index count and simplifies security rule maintenance.

## 🟢 Infos
- **[schema/sparse-field]** (`request`) Field "request" in "request" is present in 2/3 documents (67%).
- **[perf/sampling-limit-reached]** (`Immeubles`) "Immeubles" returned exactly 100 documents — the sampling limit. This collection likely has more data that was not analysed.
- **[cost/collection-at-limit]** (`Immeubles`) "Immeubles" hit the 100-document sampling cap — actual size is unknown.
