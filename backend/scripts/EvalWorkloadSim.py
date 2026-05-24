"""
NexaServe v2 — Workload Distribution Simulation

Compares 4 ticket-assignment strategies across 100 simulated ticket arrivals
for 4 support agents. Standalone, standard library only.

    python EvalWorkloadSim.py

Strategies:
  1. Random              — assign each ticket to a random agent
  2. Round Robin         — cycle 1,2,3,4,1,2,3,4...
  3. Fewest Open Tickets — assign to the agent with the lowest open count
  4. AI Supervisor       — Fewest Open Tickets + periodic redistribution:
                           every 10 assignments, if any agent has >10 open
                           tickets, move 3 from the most overloaded agent to
                           the least loaded one and count the reassignments.

Each strategy runs independently from the SAME starting state. random.seed(42)
is re-applied before every run so all 4 strategies see identical ticket
arrivals and identical ticket-close events — an apples-to-apples comparison.

Metrics per strategy:
  Gini coefficient  — fairness of the final open-ticket distribution (0 = equal)
  Max queue depth   — highest open count any agent reached during the sim
  Avg queue depth   — mean open tickets per agent at the end
  Reassignments     — tickets moved by the supervisor (non-zero for AI only)
  SLA breach rate   — % of assignments where the receiving agent already
                      had >8 open tickets at assignment time
"""

import random
import statistics
import copy

NUM_AGENTS = 4
NUM_TICKETS = 100
SLA_THRESHOLD = 8       # >8 open at assignment time counts as an SLA breach
OVERLOAD_THRESHOLD = 10  # supervisor acts when an agent exceeds this
REASSIGN_BATCH = 3      # tickets moved per supervisor intervention


def gini_coefficient(values):
    """Gini coefficient — identical formula to scripts/evaluateWorkload.js."""
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    total = sum(sorted_vals)
    if total == 0:
        return 0.0
    weighted = sum((i + 1) * v for i, v in enumerate(sorted_vals))
    return (2 * weighted) / (n * total) - (n + 1) / n


def initial_state():
    """4 agents, each with a random starting open count in [0, 5]."""
    return [random.randint(0, 5) for _ in range(NUM_AGENTS)]


def close_tickets(open_counts):
    """Each agent resolves 0-2 tickets (cannot go below 0)."""
    for i in range(len(open_counts)):
        closed = random.randint(0, 2)
        open_counts[i] = max(0, open_counts[i] - closed)


def simulate(strategy, start_state):
    """
    Run one strategy from start_state. Returns a metrics dict.

    strategy: one of "random", "round_robin", "fewest", "ai_supervisor"
    """
    open_counts = copy.deepcopy(start_state)
    max_queue = max(open_counts)          # track peak over the whole run
    sla_breaches = 0
    reassignments = 0
    rr_index = 0                          # round-robin cursor

    for ticket_num in range(1, NUM_TICKETS + 1):
        # pick the receiving agent
        if strategy == "random":
            agent = random.randint(0, NUM_AGENTS - 1)
        elif strategy == "round_robin":
            agent = rr_index
            rr_index = (rr_index + 1) % NUM_AGENTS
        else:  # "fewest" and "ai_supervisor" both assign to the fewest-open agent
            agent = open_counts.index(min(open_counts))

        # SLA breach: receiving agent already over threshold BEFORE this assignment
        if open_counts[agent] > SLA_THRESHOLD:
            sla_breaches += 1

        open_counts[agent] += 1
        max_queue = max(max_queue, max(open_counts))

        # AI Supervisor redistribution every 10 assignments
        if strategy == "ai_supervisor" and ticket_num % 10 == 0:
            if max(open_counts) > OVERLOAD_THRESHOLD:
                most = open_counts.index(max(open_counts))
                least = open_counts.index(min(open_counts))
                if most != least:
                    moved = min(REASSIGN_BATCH, open_counts[most])
                    open_counts[most] -= moved
                    open_counts[least] += moved
                    reassignments += moved
                    max_queue = max(max_queue, max(open_counts))

        # every 5 assignments, agents resolve some tickets
        if ticket_num % 5 == 0:
            close_tickets(open_counts)

    return {
        "gini": gini_coefficient(open_counts),
        "max_queue": max_queue,
        "avg_queue": statistics.mean(open_counts),
        "reassignments": reassignments,
        "sla_breach_rate": sla_breaches / NUM_TICKETS * 100,
        "final_state": open_counts,
    }


def main():
    print("=" * 78)
    print(" NEXASERVE v2 — WORKLOAD DISTRIBUTION SIMULATION")
    print("=" * 78)
    print(f" Agents: {NUM_AGENTS}   Ticket arrivals: {NUM_TICKETS}   "
          f"SLA threshold: >{SLA_THRESHOLD} open")
    print()

    # Establish the shared starting state with seed 42.
    random.seed(42)
    start_state = initial_state()
    print(f" Starting open-ticket counts: {start_state}")
    print()

    strategies = [
        ("Random", "random"),
        ("Round Robin", "round_robin"),
        ("Fewest Open Tickets", "fewest"),
        ("AI Supervisor", "ai_supervisor"),
    ]

    results = []
    for label, key in strategies:
        # Re-seed before each run so all strategies see identical
        # ticket arrivals and close events from the same start state.
        random.seed(42)
        initial_state()  # consume the same RNG draws used to build start_state
        metrics = simulate(key, start_state)
        results.append((label, metrics))
        print(f" {label}: final state {metrics['final_state']}")

    # Summary table
    print()
    print("=" * 78)
    print(" SUMMARY")
    print("=" * 78)
    header = (f"{'Assignment Method':<20} | {'Gini':<5} | {'Max Queue':<9} | "
              f"{'Avg Queue':<9} | {'Reassignments':<13} | {'SLA Breach Rate'}")
    print(header)
    print("-" * len(header))
    for label, m in results:
        print(f"{label:<20} | {m['gini']:<5.2f} | {m['max_queue']:<9} | "
              f"{m['avg_queue']:<9.2f} | {m['reassignments']:<13} | "
              f"{m['sla_breach_rate']:.1f}%")
    print("=" * 78)


if __name__ == "__main__":
    main()
