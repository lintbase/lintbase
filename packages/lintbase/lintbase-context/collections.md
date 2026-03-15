# Collections Detailed Schema

This document defines the exact ground-truth fields for every collection in the database.

## Baux
- `bail` (map)

## Immeubles
- `amenities` (map)
- `country` (string)
- `zipCode` (string)
- `city` (string)
- `rentDaysDisableSendingTenantWelcomeLeaseEmail` (boolean)
- `streetName` (string)
- `rentDaysEnableAutoGenerateLateRentIssue` (boolean)
- `rentDaysLeaseRenewDays` (number)
- `province` (string)
- `countryCode` (string)
- `rentDaysLateRentIssueFollowUpReminderFrequencyDays` (number)
- `rentDaysSendLeaseRenewEmailNotifications` (boolean)
- `address` (string)
- `enableDaylightSavingTime` (boolean)
- `streetNumber` (string)
- `provinceCode` (string)
- `buildingCode` (string)
- `rentDaysSendInvoiceNotificationEmailDays` (number)
- `rentDaysEnableSendFollowUpReminderForLateRentIssue` (boolean)
- `rentDaysEnableRentInvoiceNotificationEmail` (boolean)
- `timeZoneName` (string)
- `rentDaysLateRentIssueDays` (number)
- `name` (string)
- `addressLocation` (string)
- `rentDaysUpcomingVacancyGap` (number)
- `buldingStackId` (string) (optional, 99% presence)
- `ownerFirebaseID` (string) (optional, 99% presence)
- `ownerName` (string) (optional, 99% presence)
- `nbApt` (string) (optional, 99% presence)
- `immeubleID` (string) (optional, 99% presence)
- `codePostal` (string) (optional, 99% presence)
- `buldingID` (string) (optional, 1% presence) - Note: Sparse: 1% presence
- `buildingStackID` (number) (optional, 1% presence) - Note: Sparse: 1% presence

## Leads
- `onboarded` (boolean)
- `buldingStack` (string)
- `uid` (string)
- `nbImmeuble` (number)
- `numero` (string)
- `realStripeID` (string)
- `accountType` (string)
- `businessName` (string)
- `immbeubles` (array)
- `email` (string)
- `formule` (string)
- `clientType` (string) (optional, 92% presence)
- `RealStripeId` (string) (optional, 85% presence)
- `stripeAccountInfo` (union(map | string)) (optional, 92% presence) - Note: Type mismatch: map | string
- `buldindStackAssosId` (number) (optional, 31% presence) - Note: Sparse: 31% presence
- `buildingStackListId` (array) (optional, 23% presence) - Note: Sparse: 23% presence
- `buildingStackUserId` (number) (optional, 23% presence) - Note: Sparse: 23% presence
- `business` (string) (optional, 8% presence) - Note: Sparse: 8% presence
- `nom` (string) (optional, 8% presence) - Note: Sparse: 8% presence
- `prenom` (string) (optional, 8% presence) - Note: Sparse: 8% presence

## Meetings
- `dateAssemblee` (string)
- `timeAssemble` (string)
- `presidentEmail` (string)
- `meetingID` (string)
- `immeubleID` (string)
- `presidentFirebaseID` (string)
- `RoomURL` (string)
- `HostRoomUrl` (string)
- `nbQuestion` (number)
- `nbResponse` (number)

## Membres
- `country` (string)
- `buldingStackId` (string)
- `province` (string)
- `city` (string)
- `provinceCode` (string)
- `presidentEmail` (string)
- `nbApt` (string)
- `membreID` (string)
- `presidentFirebaseID` (string)
- `membreName` (string)
- `phone` (string) (optional, 96% presence)
- `email` (string) (optional, 85% presence)
- `zipCode` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `address` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `streetNumber` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `buildingCode` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `codePostal` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `streetName` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `name` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `addressLocation` (string) (optional, 25% presence) - Note: Sparse: 25% presence
- `dateAssemblee` (string) (optional, 4% presence) - Note: Sparse: 4% presence

## NewLease
- `payload` (array)

## NewTenant
- `payload` (union(null | map)) (optional, 92% presence) - Note: Type mismatch: null | map

## NewTicket
- `Dkxk` (string)

## StakeHolders
- `bail` (string)

## Users

## bankinfo
- `institutionNumber` (string) (optional, 99% presence)
- `transitNumber` (string) (optional, 99% presence)
- `accountNumber` (string) (optional, 99% presence)

## consoleLog
- `console` (string) (optional, 92% presence)

## infoskokote
- `hostname` (string)
- `telchambre` (string)
- `teladmin` (string)
- `time` (number)

## monthlyreport
- `hostname` (string)
- `telchambre` (string)
- `teladmin` (string)
- `time` (number)

## pendingrewal
- `idDocument` (string)
- `lease` (map)
- `status` (string)
- `proprio` (union(null | map)) - Note: Type mismatch: null | map

## releve
- `kohl` (string) (optional, 14% presence) - Note: Sparse: 14% presence
- `mom;` (string) (optional, 14% presence) - Note: Sparse: 14% presence
- `kjk` (string) (optional, 14% presence) - Note: Sparse: 14% presence
- `mlml` (string) (optional, 14% presence) - Note: Sparse: 14% presence
- `knljkn` (string) (optional, 14% presence) - Note: Sparse: 14% presence
- `ski` (string) (optional, 14% presence) - Note: Sparse: 14% presence

## request
- `request` (map) (optional, 67% presence) - Note: Optional: 67% presence

## requestGet
- `request` (map)

## requestPost
- `request` (map)

## stake
- `owners` (array)

## supportForm
- `phone` (string)
- `name` (string)
- `message` (string) (optional, 17% presence) - Note: Sparse: 17% presence

## surveySatisfaction

## testPayload
- `payload` (map)
