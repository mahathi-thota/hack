#!/usr/bin/env python3
"""
PS-I2 "Intelligence Without the Data Centre" - synthetic dataset generator.

Produces:
  1. A parallel synthetic government-form corpus in 6 Indian languages +
     English, as a structured text layer with extraction and reasoning QA.
     Parallel = the SAME semantic content in every language, which is what
     makes per-language degradation comparable rather than confounded.
  2. A tokeniser fertility probe set (identical meaning, 7 languages).
  3. Low-end device profiles and a telemetry schema for the on-device harness.

IMPORTANT: no synthetic latency or quality numbers are supplied as results.
Latency, memory and per-language quality MUST be measured on real hardware.
The telemetry sample here exists only to test your reporting harness.
"""
import json, os, csv, random

SEED = 20260806
random.seed(SEED)
OUT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(OUT, "public")
os.makedirs(PUB, exist_ok=True)
os.makedirs(os.path.join(PUB, "forms"), exist_ok=True)

LANGS = ["en", "hi", "bn", "te", "ta", "mr", "kn"]
LANG_NAMES = {"en": "English", "hi": "Hindi", "bn": "Bengali", "te": "Telugu",
              "ta": "Tamil", "mr": "Marathi", "kn": "Kannada"}

# Field labels as they appear on real forms, per language.
LABELS = {
    "applicant_name": {"en": "Applicant Name", "hi": "आवेदक का नाम", "bn": "আবেদনকারীর নাম",
                       "te": "దరఖాస్తుదారు పేరు", "ta": "விண்ணப்பதாரர் பெயர்",
                       "mr": "अर्जदाराचे नाव", "kn": "ಅರ್ಜಿದಾರರ ಹೆಸರು"},
    "father_name":    {"en": "Father's Name", "hi": "पिता का नाम", "bn": "পিতার নাম",
                       "te": "తండ్రి పేరు", "ta": "தந்தையின் பெயர்",
                       "mr": "वडिलांचे नाव", "kn": "ತಂದೆಯ ಹೆಸರು"},
    "address":        {"en": "Address", "hi": "पता", "bn": "ঠিকানা", "te": "చిరునామా",
                       "ta": "முகவரி", "mr": "पत्ता", "kn": "ವಿಳಾಸ"},
    "district":       {"en": "District", "hi": "जिला", "bn": "জেলা", "te": "జిల్లా",
                       "ta": "மாவட்டம்", "mr": "जिल्हा", "kn": "ಜಿಲ್ಲೆ"},
    "date_of_birth":  {"en": "Date of Birth", "hi": "जन्म तिथि", "bn": "জন্ম তারিখ",
                       "te": "పుట్టిన తేదీ", "ta": "பிறந்த தேதி",
                       "mr": "जन्म दिनांक", "kn": "ಜನ್ಮ ದಿನಾಂಕ"},
    "annual_income":  {"en": "Annual Income (Rs.)", "hi": "वार्षिक आय (रु.)",
                       "bn": "বার্ষিক আয় (টাকা)", "te": "వార్షిక ఆదాయం (రూ.)",
                       "ta": "ஆண்டு வருமானம் (ரூ.)", "mr": "वार्षिक उत्पन्न (रु.)",
                       "kn": "ವಾರ್ಷಿಕ ಆದಾಯ (ರೂ.)"},
    "family_members": {"en": "Number of Family Members", "hi": "परिवार के सदस्यों की संख्या",
                       "bn": "পরিবারের সদস্য সংখ্যা", "te": "కుటుంబ సభ్యుల సంఖ్య",
                       "ta": "குடும்ப உறுப்பினர்கள் எண்ணிக்கை",
                       "mr": "कुटुंब सदस्यांची संख्या", "kn": "ಕುಟುಂಬ ಸದಸ್ಯರ ಸಂಖ್ಯೆ"},
    "application_date": {"en": "Date of Application", "hi": "आवेदन की तिथि",
                         "bn": "আবেদনের তারিখ", "te": "దరఖాస్తు తేదీ",
                         "ta": "விண்ணப்ப தேதி", "mr": "अर्जाची तारीख",
                         "kn": "ಅರ್ಜಿ ದಿನಾಂಕ"},
    "category":       {"en": "Category", "hi": "श्रेणी", "bn": "শ্রেণী", "te": "వర్గం",
                       "ta": "பிரிவு", "mr": "प्रवर्ग", "kn": "ವರ್ಗ"},
}
FORM_TITLES = {
    "ration_card":  {"en": "Application for Ration Card", "hi": "राशन कार्ड के लिए आवेदन",
                     "bn": "রেশন কার্ডের জন্য আবেদন", "te": "రేషన్ కార్డు కోసం దరఖాస్తు",
                     "ta": "ரேஷன் அட்டைக்கான விண்ணப்பம்", "mr": "रेशन कार्डसाठी अर्ज",
                     "kn": "ಪಡಿತರ ಚೀಟಿಗಾಗಿ ಅರ್ಜಿ"},
    "scholarship":  {"en": "Post-Matric Scholarship Application",
                     "hi": "मैट्रिक के बाद छात्रवृत्ति आवेदन",
                     "bn": "ম্যাট্রিক-পরবর্তী বৃত্তির আবেদন",
                     "te": "మెట్రిక్ అనంతర ఉపకార వేతన దరఖాస్తు",
                     "ta": "மெட்ரிக் பிந்தைய உதவித்தொகை விண்ணப்பம்",
                     "mr": "मॅट्रिकोत्तर शिष्यवृत्ती अर्ज",
                     "kn": "ಮೆಟ್ರಿಕ್ ನಂತರದ ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿ"},
    "old_age_pension": {"en": "Old Age Pension Application",
                        "hi": "वृद्धावस्था पेंशन आवेदन", "bn": "বার্ধক্য ভাতার আবেদন",
                        "te": "వృద్ధాప్య పింఛను దరఖాస్తు",
                        "ta": "முதியோர் ஓய்வூதிய விண்ணப்பம்",
                        "mr": "वृद्धापकाळ निवृत्तीवेतन अर्ज",
                        "kn": "ವೃದ್ಧಾಪ್ಯ ಪಿಂಚಣಿ ಅರ್ಜಿ"},
}
# Names given in every script, so the whole document is in-language. Real forms
# are often mixed-script; the `script_mix` variant below preserves that case too.
NAMES = [
    {"en": "Lakshmi Devi", "hi": "लक्ष्मी देवी", "bn": "লক্ষ্মী দেবী", "te": "లక్ష్మీ దేవి",
     "ta": "லட்சுமி தேவி", "mr": "लक्ष्मी देवी", "kn": "ಲಕ್ಷ್ಮಿ ದೇವಿ"},
    {"en": "Ramesh Kumar", "hi": "रमेश कुमार", "bn": "রমেশ কুমার", "te": "రమేష్ కుమార్",
     "ta": "ரமேஷ் குமார்", "mr": "रमेश कुमार", "kn": "ರಮೇಶ್ ಕುಮಾರ್"},
    {"en": "Anjali Patil", "hi": "अंजली पाटील", "bn": "অঞ্জলি পাটিল", "te": "అంజలి పాటిల్",
     "ta": "அஞ்சலி பாட்டீல்", "mr": "अंजली पाटील", "kn": "ಅಂಜಲಿ ಪಾಟೀಲ್"},
    {"en": "Suresh Rao", "hi": "सुरेश राव", "bn": "সুরেশ রাও", "te": "సురేష్ రావు",
     "ta": "சுரேஷ் ராவ்", "mr": "सुरेश राव", "kn": "ಸುರೇಶ್ ರಾವ್"},
    {"en": "Fatima Begum", "hi": "फ़ातिमा बेगम", "bn": "ফাতিমা বেগম", "te": "ఫాతిమా బేగం",
     "ta": "பாத்திமா பேகம்", "mr": "फातिमा बेगम", "kn": "ಫಾತಿಮಾ ಬೇಗಂ"},
    {"en": "Venkat Reddy", "hi": "वेंकट रेड्डी", "bn": "ভেঙ্কট রেড্ডি", "te": "వెంకట్ రెడ్డి",
     "ta": "வெங்கட் ரெட்டி", "mr": "वेंकट रेड्डी", "kn": "ವೆಂಕಟ್ ರೆಡ್ಡಿ"},
    {"en": "Meena Kumari", "hi": "मीना कुमारी", "bn": "মীনা কুমারী", "te": "మీనా కుమారి",
     "ta": "மீனா குமாரி", "mr": "मीना कुमारी", "kn": "ಮೀನಾ ಕುಮಾರಿ"},
    {"en": "Arjun Nair", "hi": "अर्जुन नायर", "bn": "অর্জুন নায়ার", "te": "అర్జున్ నాయర్",
     "ta": "அர்ஜுன் நாயர்", "mr": "अर्जुन नायर", "kn": "ಅರ್ಜುನ್ ನಾಯರ್"},
]
DISTRICTS = [
    {"en": "Visakhapatnam", "hi": "विशाखापत्तनम", "bn": "বিশাখাপত্তনম", "te": "విశాఖపట్నం",
     "ta": "விசாகப்பட்டினம்", "mr": "विशाखापट्टणम", "kn": "ವಿಶಾಖಪಟ್ಟಣಂ"},
    {"en": "Nashik", "hi": "नाशिक", "bn": "নাসিক", "te": "నాసిక్", "ta": "நாசிக்",
     "mr": "नाशिक", "kn": "ನಾಸಿಕ್"},
    {"en": "Salem", "hi": "सेलम", "bn": "সালেম", "te": "సేలం", "ta": "சேலம்",
     "mr": "सेलम", "kn": "ಸೇಲಂ"},
    {"en": "Guntur", "hi": "गुंटूर", "bn": "গুন্টুর", "te": "గుంటూరు", "ta": "குண்டூர்",
     "mr": "गुंटूर", "kn": "ಗುಂಟೂರು"},
]
CATEGORIES = ["General", "OBC", "SC", "ST", "EWS"]

# Eligibility rules -> the reasoning QA has a checkable answer
RULES = {
    "ration_card":     {"income_max": 120000, "min_members": 2},
    "scholarship":     {"income_max": 250000, "min_members": 1},
    "old_age_pension": {"income_max": 90000,  "min_members": 1},
}


def make_form(i):
    ftype = random.choice(list(FORM_TITLES))
    rec = {
        "applicant_name": random.choice(NAMES),
        "father_name": random.choice(NAMES),
        "address": f"H.No {random.randint(1,199)}-{random.randint(1,99)}, "
                   f"{random.choice(['Gandhi Nagar','Shivaji Road','Nehru Colony','Market Street'])}",
        "district": random.choice(DISTRICTS),
        "date_of_birth": f"{random.randint(1,28):02d}/{random.randint(1,12):02d}/{random.randint(1948,2006)}",
        "annual_income": random.choice([48000, 72000, 96000, 118000, 145000, 232000, 310000]),
        "family_members": random.randint(1, 8),
        "application_date": f"{random.randint(1,28):02d}/0{random.randint(1,6)}/2026",
        "category": random.choice(CATEGORIES),
    }
    r = RULES[ftype]
    eligible = rec["annual_income"] <= r["income_max"] and rec["family_members"] >= r["min_members"]

    doc = {"form_id": f"F{i:04d}", "form_type": ftype, "fields": rec,
           "eligibility_rule": r, "text_layer": {}, "qa": []}

    def val(v, lg):
        return v[lg] if isinstance(v, dict) else v

    for lg in LANGS:
        lines = [FORM_TITLES[ftype][lg], "-" * 40]
        for k, v in rec.items():
            lines.append(f"{LABELS[k][lg]}: {val(v, lg)}")
        doc["text_layer"][lg] = "\n".join(lines)
    doc["fields"] = {k: (v["en"] if isinstance(v, dict) else v) for k, v in rec.items()}

    # extraction QA (answer is language-independent -> comparable across languages)
    for k in ["applicant_name", "district", "annual_income", "family_members", "category"]:
        doc["qa"].append({"qid": f"F{i:04d}-x-{k}", "type": "extraction",
                          "field": k,
                          "answer": str(rec[k]["en"] if isinstance(rec[k], dict) else rec[k]),
                          "answer_by_lang": ({lg: rec[k][lg] for lg in LANGS}
                                             if isinstance(rec[k], dict) else None),
                          "question": {lg: f"{LABELS[k][lg]}?" for lg in LANGS}})
    # reasoning QA
    doc["qa"].append({
        "qid": f"F{i:04d}-r-elig", "type": "reasoning",
        "answer": "yes" if eligible else "no",
        "rationale": f"income {rec['annual_income']} vs cap {r['income_max']}; "
                     f"members {rec['family_members']} vs min {r['min_members']}",
        "question": {"en": "Based on the income cap and household size rule, is this applicant eligible? Answer yes or no.",
                     "hi": "आय सीमा और परिवार के आकार के नियम के आधार पर, क्या यह आवेदक पात्र है? हाँ या नहीं में उत्तर दें।",
                     "bn": "আয়ের সীমা এবং পরিবারের আকারের নিয়ম অনুসারে, এই আবেদনকারী কি যোগ্য? হ্যাঁ বা না উত্তর দিন।",
                     "te": "ఆదాయ పరిమితి మరియు కుటుంబ పరిమాణ నియమం ఆధారంగా, ఈ దరఖాస్తుదారు అర్హులా? అవును లేదా కాదు అని సమాధానం ఇవ్వండి.",
                     "ta": "வருமான வரம்பு மற்றும் குடும்ப அளவு விதியின் அடிப்படையில், இந்த விண்ணப்பதாரர் தகுதியானவரா? ஆம் அல்லது இல்லை என பதிலளிக்கவும்.",
                     "mr": "उत्पन्न मर्यादा आणि कुटुंब आकाराच्या नियमानुसार, हा अर्जदार पात्र आहे का? होय किंवा नाही उत्तर द्या.",
                     "kn": "ಆದಾಯ ಮಿತಿ ಮತ್ತು ಕುಟುಂಬ ಗಾತ್ರದ ನಿಯಮದ ಆಧಾರದ ಮೇಲೆ, ಈ ಅರ್ಜಿದಾರರು ಅರ್ಹರೇ? ಹೌದು ಅಥವಾ ಇಲ್ಲ ಎಂದು ಉತ್ತರಿಸಿ."}})
    return doc


# Parallel probe sentences for tokeniser fertility - identical meaning across languages
FERTILITY = [
    {"en": "The application must be submitted before the last date.",
     "hi": "आवेदन अंतिम तिथि से पहले जमा करना होगा।",
     "bn": "আবেদনটি শেষ তারিখের আগে জমা দিতে হবে।",
     "te": "దరఖాస్తును చివరి తేదీలోపు సమర్పించాలి.",
     "ta": "விண்ணப்பத்தை கடைசி தேதிக்கு முன் சமர்ப்பிக்க வேண்டும்.",
     "mr": "अर्ज शेवटच्या तारखेपूर्वी सादर करावा लागेल.",
     "kn": "ಅರ್ಜಿಯನ್ನು ಕೊನೆಯ ದಿನಾಂಕದೊಳಗೆ ಸಲ್ಲಿಸಬೇಕು."},
    {"en": "Please bring your identity proof and two photographs.",
     "hi": "कृपया अपना पहचान प्रमाण और दो तस्वीरें लाएँ।",
     "bn": "অনুগ্রহ করে আপনার পরিচয়পত্র এবং দুটি ছবি আনুন।",
     "te": "దయచేసి మీ గుర్తింపు రుజువు మరియు రెండు ఫోటోలు తీసుకురండి.",
     "ta": "தயவுசெய்து உங்கள் அடையாளச் சான்று மற்றும் இரண்டு புகைப்படங்களைக் கொண்டு வாருங்கள்.",
     "mr": "कृपया आपला ओळखपत्र आणि दोन छायाचित्रे आणा.",
     "kn": "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಗುರುತಿನ ಪುರಾವೆ ಮತ್ತು ಎರಡು ಛಾಯಾಚಿತ್ರಗಳನ್ನು ತನ್ನಿ."},
    {"en": "The crop should be watered twice a week during dry weather.",
     "hi": "सूखे मौसम में फसल को सप्ताह में दो बार पानी देना चाहिए।",
     "bn": "শুষ্ক আবহাওয়ায় ফসলে সপ্তাহে দুবার জল দিতে হবে।",
     "te": "పొడి వాతావరణంలో పంటకు వారానికి రెండుసార్లు నీరు పెట్టాలి.",
     "ta": "வறண்ட காலநிலையில் பயிருக்கு வாரத்திற்கு இரண்டு முறை நீர் பாய்ச்ச வேண்டும்.",
     "mr": "कोरड्या हवामानात पिकाला आठवड्यातून दोनदा पाणी द्यावे.",
     "kn": "ಒಣ ಹವಾಮಾನದಲ್ಲಿ ಬೆಳೆಗೆ ವಾರಕ್ಕೆ ಎರಡು ಬಾರಿ ನೀರು ಹಾಕಬೇಕು."},
    {"en": "If the fever continues for more than three days, visit the health centre.",
     "hi": "यदि बुखार तीन दिन से अधिक रहता है, तो स्वास्थ्य केंद्र जाएँ।",
     "bn": "যদি জ্বর তিন দিনের বেশি থাকে, স্বাস্থ্যকেন্দ্রে যান।",
     "te": "జ్వరం మూడు రోజులకు మించి కొనసాగితే, ఆరోగ్య కేంద్రానికి వెళ్లండి.",
     "ta": "காய்ச்சல் மூன்று நாட்களுக்கு மேல் தொடர்ந்தால், சுகாதார நிலையத்திற்குச் செல்லுங்கள்.",
     "mr": "ताप तीन दिवसांपेक्षा जास्त राहिल्यास, आरोग्य केंद्रात जा.",
     "kn": "ಜ್ವರ ಮೂರು ದಿನಗಳಿಗಿಂತ ಹೆಚ್ಚು ಮುಂದುವರಿದರೆ, ಆರೋಗ್ಯ ಕೇಂದ್ರಕ್ಕೆ ಭೇಟಿ ನೀಡಿ."},
    {"en": "Children below five years are eligible for the free meal scheme.",
     "hi": "पाँच वर्ष से कम आयु के बच्चे नि:शुल्क भोजन योजना के पात्र हैं।",
     "bn": "পাঁচ বছরের কম বয়সী শিশুরা বিনামূল্যে খাবার প্রকল্পের যোগ্য।",
     "te": "ఐదు సంవత్సరాల లోపు పిల్లలు ఉచిత భోజన పథకానికి అర్హులు.",
     "ta": "ஐந்து வயதுக்குக் குறைவான குழந்தைகள் இலவச உணவுத் திட்டத்திற்குத் தகுதியானவர்கள்.",
     "mr": "पाच वर्षांखालील मुले मोफत भोजन योजनेसाठी पात्र आहेत.",
     "kn": "ಐದು ವರ್ಷದೊಳಗಿನ ಮಕ್ಕಳು ಉಚಿತ ಊಟ ಯೋಜನೆಗೆ ಅರ್ಹರು."},
]

DEVICES = [
    {"device_id": "D1", "model_class": "entry_2022", "price_band_inr": "8000-10000",
     "soc": "octa-core A53-class 2.0GHz", "ram_gb": 3, "usable_ram_mb": 1250,
     "storage": "eMMC 5.1", "seq_read_mbps": 290, "thermal_budget_w": 2.5,
     "sustained_clock_ratio": 0.62, "android": 11},
    {"device_id": "D2", "model_class": "entry_2023", "price_band_inr": "9000-12000",
     "soc": "octa-core A55-class 2.2GHz", "ram_gb": 4, "usable_ram_mb": 1750,
     "storage": "UFS 2.2", "seq_read_mbps": 850, "thermal_budget_w": 3.0,
     "sustained_clock_ratio": 0.70, "android": 13},
    {"device_id": "D3", "model_class": "budget_2021", "price_band_inr": "7000-9000",
     "soc": "quad-core A53-class 1.8GHz", "ram_gb": 2, "usable_ram_mb": 780,
     "storage": "eMMC 5.1", "seq_read_mbps": 210, "thermal_budget_w": 2.2,
     "sustained_clock_ratio": 0.55, "android": 10},
    {"device_id": "D4", "model_class": "midrange_2024_reference", "price_band_inr": "18000-22000",
     "soc": "octa-core A78-class 2.4GHz", "ram_gb": 8, "usable_ram_mb": 4200,
     "storage": "UFS 3.1", "seq_read_mbps": 1600, "thermal_budget_w": 4.5,
     "sustained_clock_ratio": 0.82, "android": 14},
]

TELEMETRY_SCHEMA = {
    "run_id": "str", "device_id": "str", "model_id": "str", "quantisation": "str",
    "language": "str", "task": "str", "cold_start": "bool",
    "model_load_ms": "int", "prefill_ms": "int", "decode_ms_per_token": "float",
    "tokens_in": "int", "tokens_out": "int", "peak_rss_mb": "int",
    "battery_delta_mah": "float", "soc_temp_c_start": "float", "soc_temp_c_end": "float",
    "throttled": "bool", "airplane_mode": "bool", "wall_clock_ms": "int",
}


def main():
    forms = [make_form(i) for i in range(120)]
    with open(os.path.join(PUB, "forms", "forms.jsonl"), "w") as f:
        for d in forms:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    # flat QA file for scoring convenience
    with open(os.path.join(PUB, "forms", "qa_flat.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["qid", "form_id", "form_type", "lang", "type", "question", "answer"])
        for d in forms:
            for q in d["qa"]:
                for lg in LANGS:
                    ans = (q.get("answer_by_lang") or {}).get(lg, q["answer"])
                    w.writerow([f"{q['qid']}-{lg}", d["form_id"], d["form_type"], lg,
                                q["type"], q["question"][lg], ans])

    json.dump(FERTILITY, open(os.path.join(PUB, "fertility_probe.json"), "w"),
              ensure_ascii=False, indent=2)
    json.dump(DEVICES, open(os.path.join(PUB, "device_profiles.json"), "w"), indent=2)
    json.dump({"schema": TELEMETRY_SCHEMA,
               "note": "Populate this by measuring on a real handset. No synthetic "
                       "latency or accuracy figures are provided; a simulated number "
                       "reported as a result is a disqualifying claim."},
              open(os.path.join(PUB, "telemetry_schema.json"), "w"), indent=2)

    # tiny harness-test file so teams can build the reporting path before hardware arrives
    with open(os.path.join(PUB, "telemetry_HARNESS_TEST_ONLY.jsonl"), "w") as f:
        for i in range(40):
            f.write(json.dumps({
                "run_id": f"SYNTHETIC-{i:03d}", "device_id": random.choice([d["device_id"] for d in DEVICES]),
                "model_id": "PLACEHOLDER", "quantisation": random.choice(["fp16", "q8_0", "q4_k_m", "q4_0"]),
                "language": random.choice(LANGS), "task": "form_qa", "cold_start": i % 5 == 0,
                "model_load_ms": 0, "prefill_ms": 0, "decode_ms_per_token": 0.0,
                "tokens_in": 0, "tokens_out": 0, "peak_rss_mb": 0, "battery_delta_mah": 0.0,
                "soc_temp_c_start": 0.0, "soc_temp_c_end": 0.0, "throttled": False,
                "airplane_mode": True, "wall_clock_ms": 0,
                "_warning": "ZEROED ON PURPOSE - schema test fixture, not data",
            }) + "\n")

    n_q = sum(len(d["qa"]) for d in forms) * len(LANGS)
    print(f"PS-I2: {len(forms)} parallel forms x {len(LANGS)} languages, {n_q} QA items")
    print("       fertility probe:", len(FERTILITY), "sentences x", len(LANGS), "languages")
    print("       eligibility yes/no balance:",
          sum(1 for d in forms if d["qa"][-1]["answer"] == "yes"), "/", len(forms))


if __name__ == "__main__":
    main()
