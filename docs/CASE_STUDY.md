# Case study: making messy partner exports reviewable

A fictional operations team receives small CSV order exports from two partners. One partner uses `Order ID, Region, Quantity, Amount`; the other uses `reference, territory, units, total`. The team needs to see what would be accepted, what needs review, and why before sending anything downstream.

Field Relay makes that workflow inspectable. It retains source rows for held records, uses integer minor units for money, explains route selection, and makes a simulated endpoint failure recoverable. This is a portfolio demonstration of operational reasoning, not a production integration. It intentionally omits vendor connections, authentication, persistent storage, file uploads and real deliveries.
