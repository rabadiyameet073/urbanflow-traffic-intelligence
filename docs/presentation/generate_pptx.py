import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def build_13_slide_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Theme Colors (UrbanFlow Modern Dark Palette)
    BG_COLOR = RGBColor(15, 23, 42)       # Slate 900 (#0F172A)
    CARD_BG = RGBColor(30, 41, 59)        # Slate 800 (#1E293B)
    CARD_BORDER = RGBColor(51, 65, 85)    # Slate 700 (#334155)
    TEXT_MAIN = RGBColor(248, 250, 252)   # Slate 50
    TEXT_MUTED = RGBColor(148, 163, 184)  # Slate 400
    CYAN = RGBColor(56, 189, 248)         # Sky 400
    EMERALD = RGBColor(16, 185, 129)      # Emerald 500
    AMBER = RGBColor(245, 158, 11)        # Amber 500
    RED = RGBColor(239, 68, 68)           # Red 500
    PURPLE = RGBColor(168, 85, 247)       # Purple 500

    def add_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_COLOR
        bg.line.fill.background()
        return bg

    def add_header(slide, title, category=None):
        add_bg(slide)
        if category:
            cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.4), Inches(11.7), Inches(0.35))
            tf_c = cat_box.text_frame
            tf_c.word_wrap = True
            p_c = tf_c.paragraphs[0]
            p_c.text = category.upper()
            p_c.font.size = Pt(11)
            p_c.font.bold = True
            p_c.font.color.rgb = CYAN
        
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.7 if category else 0.5), Inches(11.7), Inches(0.8))
        tf = title_box.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(23)
        p.font.bold = True
        p.font.color.rgb = TEXT_MAIN

    def set_notes(slide, notes):
        tf = slide.notes_slide.notes_text_frame
        tf.text = notes

    # -------------------------------------------------------------
    # SLIDE 1: Title
    # -------------------------------------------------------------
    s1 = prs.slides.add_slide(blank_layout)
    add_bg(s1)
    
    t_box = s1.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(11.3), Inches(4.0))
    tf1 = t_box.text_frame
    tf1.word_wrap = True
    
    p0 = tf1.paragraphs[0]
    p0.text = "URBANFLOW: SMART CITY TRAFFIC INTELLIGENCE"
    p0.font.size = Pt(36)
    p0.font.bold = True
    p0.font.color.rgb = CYAN
    
    p1 = tf1.add_paragraph()
    p1.text = "Adaptive Traffic Signal Control at Big Data Scale"
    p1.font.size = Pt(22)
    p1.font.color.rgb = TEXT_MAIN
    p1.space_before = Pt(12)

    p2 = tf1.add_paragraph()
    p2.text = "Local Distributed Processing · MongoDB NoSQL Store · Parquet Data Lake · Cloudflare Edge · Safety Kernel"
    p2.font.size = Pt(14)
    p2.font.color.rgb = TEXT_MUTED
    p2.space_before = Pt(12)

    p3 = tf1.add_paragraph()
    p3.text = "Course: Big Data Analytics | Domain: Distributed Real-Time Systems & Cyber-Physical Safety"
    p3.font.size = Pt(13)
    p3.font.bold = True
    p3.font.color.rgb = EMERALD
    p3.space_before = Pt(28)
    
    set_notes(s1, "Good morning, respected professors. Today I am presenting UrbanFlow: an adaptive traffic signal platform that processes thousands of sensor records per second using local distributed processing for extreme fastness and MongoDB NoSQL for real-time state.")

    # -------------------------------------------------------------
    # SLIDE 2: Introduction
    # -------------------------------------------------------------
    s2 = prs.slides.add_slide(blank_layout)
    add_header(s2, "The Urban Traffic Crisis & The Need for Intelligent Control", "Slide 02 | Introduction")
    
    cards_s2 = [
        ("The Urban Crisis", "Traffic gridlock inflicts billions in economic losses, massive wasted fuel, dangerous CO2 spikes, and life-threatening delays for ambulances.", RED),
        ("The Blind Signal Problem", "Signals remain isolated 1960s timer relays. A green light is granted to an empty road while a 200m queue waits on the other side.", AMBER),
        ("The Data Disconnect", "Road loops and camera sensors generate gigabytes of traffic truth every minute, yet 99% of it is discarded immediately.", CYAN),
        ("The UrbanFlow Mission", "Process live traffic via local distributed parallelism, store it in MongoDB NoSQL/Parquet, and deliver safe decisions with 0 physical conflicts.", EMERALD)
    ]
    for i, (title, desc, col) in enumerate(cards_s2):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(1.6 + (i // 2) * 2.6)
        c = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(2.3))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(8)

    set_notes(s2, "Explain the problem: Current traffic lights are completely blind. They run the same timer cycle day and night, ignoring reality. UrbanFlow captures this reality and processes it locally at high speed.")

    # -------------------------------------------------------------
    # SLIDE 3: Today vs UrbanFlow
    # -------------------------------------------------------------
    s3 = prs.slides.add_slide(blank_layout)
    add_header(s3, "Paradigm Shift: Legacy Fixed-Time vs. Big Data Adaptive Flow", "Slide 03 | Comparison")
    
    c_left = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.6), Inches(5.6), Inches(5.1))
    c_left.fill.solid()
    c_left.fill.fore_color.rgb = CARD_BG
    c_left.line.color.rgb = RED
    tfl = c_left.text_frame
    tfl.word_wrap = True
    pl0 = tfl.paragraphs[0]
    pl0.text = "Legacy Fixed-Time Signals (Today)"
    pl0.font.size = Pt(16)
    pl0.font.bold = True
    pl0.font.color.rgb = RED
    items_l = [
        "Unchanging timer cycles regardless of real road demand",
        "Zero real-time data ingestion (signals operate completely blind)",
        "Empty streets waste green time while busy avenues sit stopped",
        "Ambulances stuck behind standard red lights in traffic",
        "Zero data retention or analytics after the second passes",
        "High driver frustration and unneeded engine idling emissions"
    ]
    for it in items_l:
        p = tfl.add_paragraph()
        p.text = "✖  " + it
        p.font.size = Pt(12)
        p.font.color.rgb = TEXT_MUTED
        p.space_before = Pt(10)

    c_right = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(1.6), Inches(5.7), Inches(5.1))
    c_right.fill.solid()
    c_right.fill.fore_color.rgb = CARD_BG
    c_right.line.color.rgb = EMERALD
    tfr = c_right.text_frame
    tfr.word_wrap = True
    pr0 = tfr.paragraphs[0]
    pr0.text = "UrbanFlow Big Data Adaptive Twin"
    pr0.font.size = Pt(16)
    pr0.font.bold = True
    pr0.font.color.rgb = EMERALD
    items_r = [
        "Dynamic phase allocation matching real-time queue pressure",
        "Local distributed parallel processing across all 8 lanes",
        "Smart phase truncation: skips empty lanes and yields green to demand",
        "Instant Verified Preemption (EVP) for ambulances with 0 delay",
        "Dual-tier storage in MongoDB NoSQL (operational) & Parquet (lake)",
        "Cuts person-delay by up to 25.6% and idle fuel/emissions by 21%"
    ]
    for it in items_r:
        p = tfr.add_paragraph()
        p.text = "✔  " + it
        p.font.size = Pt(12)
        p.font.color.rgb = TEXT_MAIN
        p.space_before = Pt(10)

    set_notes(s3, "Walk through the comparison: Legacy signals waste green on empty streets. UrbanFlow uses local distributed processing to allocate green time based on real empirical demand.")

    # -------------------------------------------------------------
    # SLIDE 4: Big Data's Role: Local Distributed Processing for Speed
    # -------------------------------------------------------------
    s4 = prs.slides.add_slide(blank_layout)
    add_header(s4, "Big Data's Role: Local Distributed Processing for Extreme Speed", "Slide 04 | Distributed Processing")
    
    roles = [
        ("High-Frequency Ingestion Scale", "An 8-lane intersection generates ~2,400 events/sec (~40 GB/day per junction; 4 TB/day for 100 junctions). Relational SQL databases freeze under this continuous write load.", CYAN),
        ("Local Distributed Processing (No Cloud Lag)", "Raw sensor data is NOT streamed over public cloud networks. Public streaming adds 50-150 ms of network lag, jitter, and bandwidth bottlenecks. We process locally for microsecond speed.", EMERALD),
        ("Multi-Lane Parallel Workers", "All 8 approach lanes are processed concurrently in parallel on local distributed worker threads. Each lane maintains independent queue buffers and EWMA anomaly trackers.", AMBER),
        ("Autonomous Resilience & Privacy", "Sensor data stays on the local distributed node. The intersection continues computing at full speed even if external internet or cloud connectivity is severed.", PURPLE)
    ]
    for i, (title, desc, col) in enumerate(roles):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(1.6 + (i // 2) * 2.6)
        c = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(2.3))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(8)

    set_notes(s4, "Highlight to professors: We use distributed processing locally for extreme speed. Streaming raw video/sensors across external cloud networks creates a 100ms bandwidth choke. Local distributed workers process all 8 lanes concurrently.")

    # -------------------------------------------------------------
    # SLIDE 5: The 5 V's & Dominating Velocity
    # -------------------------------------------------------------
    s5 = prs.slides.add_slide(blank_layout)
    add_header(s5, "The 5 V's of Big Data: VELOCITY as the Dominating Factor", "Slide 05 | Big Data Fundamentals")
    
    # Large Highlight Banner for VELOCITY
    v_banner = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.6), Inches(11.7), Inches(1.3))
    v_banner.fill.solid()
    v_banner.fill.fore_color.rgb = CARD_BG
    v_banner.line.color.rgb = CYAN
    tf_vb = v_banner.text_frame
    tf_vb.word_wrap = True
    p_vb = tf_vb.paragraphs[0]
    p_vb.text = "⚡ THE DOMINATING 'V': VELOCITY"
    p_vb.font.size = Pt(16)
    p_vb.font.bold = True
    p_vb.font.color.rgb = CYAN
    p_vb2 = tf_vb.add_paragraph()
    p_vb2.text = "In traffic intelligence, VELOCITY IS THE PRODUCT. An analytical report arriving 15 seconds late is completely useless. Traffic waves form in seconds; local distributed workers process in parallel and Cloudflare Edge computes decisions in <5 ms."
    p_vb2.font.size = Pt(12)
    p_vb2.font.color.rgb = TEXT_MAIN
    p_vb2.space_before = Pt(4)

    other_vs = [
        ("VOLUME", "40 GB/day per junction; 4 TB/day citywide. Handled by columnar Parquet on HDFS with snappy compression.", AMBER),
        ("VARIETY", "JSON sensor events, binary Parquet records, MongoDB BSON documents, cryptographic HMAC beacons, and WebSockets.", PURPLE),
        ("VERACITY", "Bad data = bad signal. Zod schema validation, sensor health states (healthy/stale/failed), and anomaly deduplication.", RED),
        ("VALUE", "Slashing commuter delay by 25.6%, fuel/CO2 emissions by 21%, and achieving 100% on-time emergency clearance.", EMERALD)
    ]
    for i, (v_name, v_desc, col) in enumerate(other_vs):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(3.1 + (i // 2) * 1.85)
        c = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(1.65))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = v_name
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = v_desc
        p2.font.size = Pt(11)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(4)

    set_notes(s5, "Emphasize to professors: VELOCITY is the lifeblood of this project. If decision latency exceeds 1 tick, the phase switch is missed.")

    # -------------------------------------------------------------
    # SLIDE 6: Why NoSQL & Why MongoDB
    # -------------------------------------------------------------
    s6 = prs.slides.add_slide(blank_layout)
    add_header(s6, "Why NoSQL & Why MongoDB: Engineered for Real-Time Fastness", "Slide 06 | Database Architecture")
    
    mongo_cards = [
        ("1. Why NoSQL Over Relational SQL?", "Relational SQL relies on table-level ACID locks and fixed tabular schemas. Under 2,400 sensor writes/sec, SQL suffers write bottlenecks. NoSQL was built for real-time speed, lock-free writes, and flexible scaling.", CYAN),
        ("2. Why MongoDB from NoSQL?", "Native BSON matches JSON vehicle/sensor payloads directly. WiredTiger engine provides in-memory lock-free concurrency, sustaining massive write throughput with sub-millisecond response.", EMERALD),
        ("3. Idempotent Upsert Guarantee", "Distributed workers write with deterministic keys: `_id = run_id | lane | window_start`. If a processing batch is retried or re-run, MongoDB updates existing records rather than duplicating data.", AMBER),
        ("4. Real-Time Operational Collections", "Stores `lane_metrics` (rolling counts, speeds, wait times), `anomalies` (sensor dropouts), and `evp_audit` (cryptographic logs) for instantaneous edge API lookups.", PURPLE)
    ]
    for i, (title, desc, col) in enumerate(mongo_cards):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(1.6 + (i // 2) * 2.6)
        c = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(2.3))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(8)

    set_notes(s6, "State clearly: Why NoSQL? Because relational SQL chokes under 2,400 writes/sec with table locking. NoSQL was built for real-time fastness. From NoSQL, why MongoDB? BSON document agility, in-memory concurrency, and idempotent upserts.")

    # -------------------------------------------------------------
    # SLIDE 7: System Advantages
    # -------------------------------------------------------------
    s7 = prs.slides.add_slide(blank_layout)
    add_header(s7, "System Advantages: Mobility, Ecology & Reliability", "Slide 07 | Impact & Benefits")
    
    advantages = [
        ("25.6% Less Commuter Delay", "Dynamic phase extensions discharge heavy approach platoons before switching, eliminating the stop-and-go shockwaves that paralyze junctions.", EMERALD),
        ("21% Cut in Idling Fuel & Emissions", "By cutting idle queuing at empty red lights, UrbanFlow significantly reduces localized NOx, particulate matter, and CO2 emissions.", CYAN),
        ("120s Anti-Starvation Guarantee", "Low-traffic side streets are never trapped. A strict max-wait timer ensures waiting vehicles are served even during major arterial surges.", AMBER),
        ("100% Explainable Audit Trail", "Every single phase switch decision carries an auditable reason code (e.g., `MAX_PRESSURE`, `EVP_PREEMPT`, `STARVATION_CLEAR`).", PURPLE)
    ]
    for i, (title, desc, col) in enumerate(advantages):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(1.6 + (i // 2) * 2.6)
        c = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(2.3))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(16)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(8)

    set_notes(s7, "Summarize the key advantages: Commuters save time, cities reduce emissions, side roads are protected from starvation, and traffic authorities gain full auditability.")

    # -------------------------------------------------------------
    # SLIDE 8: Ambulance & Advance EVP
    # -------------------------------------------------------------
    s8 = prs.slides.add_slide(blank_layout)
    add_header(s8, "Ambulance & Advance Preemption (EVP): Life-Saving Transit", "Slide 08 | Emergency Priority")
    
    evp_stages = [
        ("1. Ingest & Verify", "Ambulance broadcasts V2X beacon 300m away. Request validated with HMAC-SHA256 signature.", CYAN),
        ("2. Preclear Clearance", "Kernel immediately begins safe clearance of conflicting phases: Yellow (3.5s) + All-Red (2.0s).", AMBER),
        ("3. EMS Green Hold", "Target lane turns solid green. Protected dwell holds until vehicle crosses stop line into the box.", EMERALD),
        ("4. Safe Recovery", "Fairness recovery window returns signal control smoothly, prioritizing queued traffic.", PURPLE)
    ]
    for i, (title, desc, col) in enumerate(evp_stages):
        x = Inches(0.8 + i * 2.95)
        c = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(1.6), Inches(2.8), Inches(5.1))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = col
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(14)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(12)

    set_notes(s8, "Explain why we do not flip lights instantly: We pre-clear conflicting lanes with mandatory yellow and all-red in advance. The ambulance arrives to a clear green light without causing accidents.")

    # -------------------------------------------------------------
    # SLIDE 9: Challenges & Security
    # -------------------------------------------------------------
    s9 = prs.slides.add_slide(blank_layout)
    add_header(s9, "Engineering Challenges: Cyber Security & Physical Safety", "Slide 09 | Threat Model & Hard Invariants")
    
    challenges = [
        ("HMAC-SHA256 Authentication", "Vulnerability: Rogue emergency radio beacons spoofing green lights. Defense: Every V2X packet is digitally signed using pre-shared vehicle cryptographic keys.", CYAN),
        ("Anti-Replay Nonce Store", "Vulnerability: Malicious actors recording and replaying valid requests. Defense: Single-use cryptographic nonces and sliding timestamp windows reject duplicates.", AMBER),
        ("Storm Guard Rate Limiter", "Vulnerability: Denial of Service (DoS) request floods. Defense: Sources exceeding 20 requests/10s are automatically isolated and rate-limited for 30 seconds.", RED),
        ("Single-Writer Safety Kernel", "Vulnerability: Controller crashes commanding conflicting greens. Defense: Zero-bypass deterministic kernel owns signal state. Mandatory 3.5s yellow + 2.0s all-red cannot be bypassed.", EMERALD)
    ]
    for i, (title, desc, col) in enumerate(challenges):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(1.6 + (i // 2) * 2.6)
        c = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(2.3))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(8)

    set_notes(s9, "Emphasize security: Traffic signals are critical infrastructure. We defend against radio spoofing with HMAC-SHA256, prevent replays with nonces, and enforce life-critical safety invariants in hardware/kernel.")

    # -------------------------------------------------------------
    # SLIDE 10: Cloudflare Edge Decision Layer
    # -------------------------------------------------------------
    s10 = prs.slides.add_slide(blank_layout)
    add_header(s10, "Cloudflare Edge Layer: Sub-5ms Decision Intelligence", "Slide 10 | Edge Computing")
    
    edge_cards = [
        ("Ultra-Low Latency Execution", "Cloudflare Workers execute serverless logic across 300+ city edge points within <5 ms, eliminating central datacenter round-trip delays.", CYAN),
        ("Durable Objects State Sync", "Maintains strongly-consistent, single-instance intersection coordination for multi-operator consoles and V2X vehicle channels.", EMERALD),
        ("Cryptographic Gateway Intake", "Validates inbound HMAC-SHA256 tokens and filters replay nonces in edge memory before any control action touches the junction.", AMBER),
        ("Autonomous Fallback Guarantee", "The edge recommends decisions; the local safety kernel authorizes. If edge connectivity is severed, the signal runs on autonomous fail-safe.", PURPLE)
    ]
    for i, (title, desc, col) in enumerate(edge_cards):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(1.6 + (i // 2) * 2.6)
        c = s10.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(2.3))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = col
        p2 = tf.add_paragraph()
        p2.text = desc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_MAIN
        p2.space_before = Pt(8)

    set_notes(s10, "Explain Cloudflare Edge: Running logic at the edge keeps decision latency under 5 milliseconds. Cloudflare Workers handle authentication and state coordination, backed by autonomous local fail-safe.")

    # -------------------------------------------------------------
    # SLIDE 11: End-to-End Architecture Flow
    # -------------------------------------------------------------
    s11 = prs.slides.add_slide(blank_layout)
    add_header(s11, "End-to-End System Architecture: Local Distributed Ingestion", "Slide 11 | System Pipeline")
    
    c11 = s11.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.6), Inches(11.7), Inches(5.1))
    c11.fill.solid()
    c11.fill.fore_color.rgb = CARD_BG
    c11.line.color.rgb = CYAN
    tf11 = c11.text_frame
    tf11.word_wrap = True
    
    p = tf11.paragraphs[0]
    p.text = "Pipeline: Local Ingestion → Local Distributed Processing → MongoDB NoSQL → Cloudflare Edge → Safety Kernel"
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = CYAN
    
    steps = [
        "1. Ingestion Layer: Road sensors & V2X beacons stream 2,400 events/sec into 8 local in-memory partitions (No external streaming delay).",
        "2. Local Distributed Processing: Multi-lane worker threads concurrently compute 10s windowed queue density, arrivals, and delays in parallel.",
        "3. Dual-Tier Storage: Operational metrics write idempotently to MongoDB NoSQL, while historical batches write to Parquet/HDFS.",
        "4. Edge Decision Engine: Cloudflare Workers calculate optimal phase pressures and verify emergency HMAC requests.",
        "5. Deterministic Safety Kernel: Single-writer authority validates transitions against physical clearances (yellow 3.5s, all-red 2.0s).",
        "6. Actuation & Visualization: Commands physical signal heads while feeding live 60 FPS HTML5 Canvas twin dashboard."
    ]
    for st in steps:
        pb = tf11.add_paragraph()
        pb.text = "➔ " + st
        pb.font.size = Pt(12)
        pb.font.color.rgb = TEXT_MAIN
        pb.space_before = Pt(10)

    set_notes(s11, "Walk through the full pipeline: Trace a vehicle detection from local distributed multi-lane workers, into MongoDB NoSQL, up to the Cloudflare Worker, through the Safety Kernel, and onto the physical light.")

    # -------------------------------------------------------------
    # SLIDE 12: Empirical Results & Benchmarks
    # -------------------------------------------------------------
    s12 = prs.slides.add_slide(blank_layout)
    add_header(s12, "Empirical Validation: Measured Results Across 8 Scenarios", "Slide 12 | Benchmark Results")
    
    benchmarks = [
        ("Asymmetric Rush Hour", "Adaptive: 24.1s  |  Fixed: 32.4s", "−25.6% Delay Reduction", EMERALD),
        ("Stadium Surge Spike", "Adaptive: 31.8s  |  Fixed: 41.2s", "−22.8% Delay Reduction", EMERALD),
        ("Ambulance at 300m", "Adaptive: 0.0s delay | Fixed: 18.5s", "100% Free-Flow Clearance", CYAN),
        ("Balanced Night Flow", "Adaptive: 12.2s  |  Fixed: 12.1s", "0% Parity (Honest Benchmark)", AMBER)
    ]
    for i, (scen, nums, delta, col) in enumerate(benchmarks):
        x = Inches(0.8 + (i % 2) * 6.0)
        y = Inches(1.6 + (i // 2) * 2.5)
        c = s12.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.6), Inches(2.2))
        c.fill.solid()
        c.fill.fore_color.rgb = CARD_BG
        c.line.color.rgb = CARD_BORDER
        tf = c.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = scen
        p.font.size = Pt(15)
        p.font.bold = True
        p.font.color.rgb = TEXT_MAIN
        p2 = tf.add_paragraph()
        p2.text = nums
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED
        p2.space_before = Pt(6)
        p3 = tf.add_paragraph()
        p3.text = delta
        p3.font.size = Pt(15)
        p3.font.bold = True
        p3.font.color.rgb = col
        p3.space_before = Pt(8)

    set_notes(s12, "Emphasize our scientific honesty: In balanced traffic, adaptive signals correctly tie with fixed-time timers. In real-world asymmetric and emergency conditions, UrbanFlow yields massive double-digit gains with zero safety conflicts.")

    # -------------------------------------------------------------
    # SLIDE 13: Conclusion & Deliverables
    # -------------------------------------------------------------
    s13 = prs.slides.add_slide(blank_layout)
    add_header(s13, "Conclusion & Project Deliverables", "Slide 13 | Final Summary")
    
    c13 = s13.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(1.6), Inches(11.7), Inches(5.1))
    c13.fill.solid()
    c13.fill.fore_color.rgb = CARD_BG
    c13.line.color.rgb = EMERALD
    tf13 = c13.text_frame
    tf13.word_wrap = True
    
    p = tf13.paragraphs[0]
    p.text = "UrbanFlow: Production-Grade Local Distributed Processing & Traffic Intelligence"
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = EMERALD
    
    bullets13 = [
        "Local Distributed Processing: Concurrent multi-lane parallel workers eliminating external cloud network latency.",
        "NoSQL Database Engine: MongoDB operational mirror delivering in-memory fastness and idempotent upsert guarantees.",
        "Zero-Defect Safety Record: Formal property tests (110+ passing vitest suites, 7/7 fitness audits) proving zero clearance conflicts.",
        "Immediate Emergency Priority: Cryptographically authenticated preemption delivering 0.0s delay at 300m advance warning.",
        "Edge Decision Intelligence: Cloudflare Worker decision layer achieving sub-5ms latency with local autonomous fail-safe.",
        "Interactive Digital Twin: Live 60 FPS HTML5 Canvas dashboard with real-time lane selection, vehicle injection, and KPI analytics."
    ]
    for b in bullets13:
        pb = tf13.add_paragraph()
        pb.text = "✔  " + b
        pb.font.size = Pt(12)
        pb.font.color.rgb = TEXT_MAIN
        pb.space_before = Pt(10)

    p_end = tf13.add_paragraph()
    p_end.text = "THANK YOU! We welcome questions from the examination committee."
    p_end.font.size = Pt(15)
    p_end.font.bold = True
    p_end.font.color.rgb = CYAN
    p_end.space_before = Pt(20)

    set_notes(s13, "Conclude confidently: Thank the committee, present the live simulation dashboard or code artifacts, and invite technical questions on local distributed processing, MongoDB NoSQL, or the Safety Kernel.")

    # Save
    os.makedirs("presentation", exist_ok=True)
    out_path = os.path.join("presentation", "UrbanFlow_BigData_Presentation.pptx")
    prs.save(out_path)
    print(f"13-Slide presentation successfully generated and saved to: {out_path}")

if __name__ == '__main__':
    build_13_slide_deck()
