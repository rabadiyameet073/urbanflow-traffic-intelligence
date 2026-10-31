# UrbanFlow AI — Limitations & Out-of-Scope Disclosures

> **Honesty by Construction:** UrbanFlow AI is a high-fidelity research simulation and operational decision-support tool.

1. **Simulation, Not Real Road Hardware:**
   UrbanFlow is designed to run in modern browsers and headless worker isolates. It is not connected to physical 170/2070/ATC signal cabinets.
2. **NTCIP-1202 Mapping Layer:**
   UrbanFlow implements an *NTCIP-1202-inspired object model* (mapping internal signal states to phase status group bitmasks). It is not certified for full NTCIP SNMP compliance.
3. **Simulated Watchdog:**
   Watchdog reversion timing is measured inside the software event loop (~100 ms). It does not substitute for hardware Conflict Monitor Units (CMU) or Malfunction Management Units (MMU).
4. **Single Intersection Scope:**
   The primary implementation models a busy 4-way, 8-lane intersection with protected lefts. Arterial corridor coordination across multiple intersections is reserved for future work.
5. **Precomputed Offline Vision Pipeline:**
   SAM 3.1 segmentation masks and Muse Image synthetic robustness assets are generated offline and loaded as committed assets to enable sub-second client loading without requiring a GPU in the live judge environment.
