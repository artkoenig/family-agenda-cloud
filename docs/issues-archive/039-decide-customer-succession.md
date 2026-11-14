# #39 Decide Customer succession

- State: CLOSED (COMPLETED)
- Labels: wayfinder:grilling
- Created: 2026-11-07T16:29:28Z
- Closed: 2026-11-07T20:30:56Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/39

## Question

What happens to the contract when the Customer leaves the Family, dies, or wants to hand over to another Admin?

---

**Comment by artkoenig, 2026-11-07T20:27:48Z**

Input from [Decide Subscription lifecycle](https://github.com/artkoenig/family-agenda-cloud/issues/38): Backup needs a signed-in Admin, but the Customer may not be one. Before an automatic closing, a Customer who is not an Admin cannot secure the data.

---

**Comment by artkoenig, 2026-11-07T20:30:56Z**

**Decision: Customer is always an Admin**

- The Customer becomes the first Admin of the Family. The app blocks demoting or removing them.
- This closes the gap from [Decide Subscription lifecycle](https://github.com/artkoenig/family-agenda-cloud/issues/38): the Customer can always download a Backup before an automatic closing.
- Consequence: the app needs a protected Admin rule. `GLOSSARY.md` updated.

**Out of scope:** the ticket's original question: hand-over to another Admin, the Customer leaving the Family, death or unreachability of the Customer, and notices to other Admins. Not needed for launch.
