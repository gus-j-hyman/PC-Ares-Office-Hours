// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAKn_PK1q7XwxeOU4fdVIpokQFunt0Qe7w",
    authDomain: "dsp-office-hours.firebaseapp.com",
    databaseURL: "https://dsp-office-hours-default-rtdb.firebaseio.com",
    projectId: "dsp-office-hours",
    storageBucket: "dsp-office-hours.firebasestorage.app",
    messagingSenderId: "383319994141",
    appId: "1:383319994141:web:dd33d59af33413a4267bf4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. STATE & EMAILJS INIT ---
emailjs.init("aKaqwihPbn46q3V25"); 

const ADMIN_PASSWORD = "BetaEta#1";

const ADMIN_USERS = [
    { id: "admin_1", name: "Gus Hyman", email: "gus.j.hyman@gmail.com" },
    { id: "admin_2", name: "Brother Wechsler", email: "pledgedevelopment@ufdsp.com" },
    { id: "admin_3", name: "Brother Hoyos", email: "a.hoyos@ufdsp.com" },
    { id: "admin_4", name: "Brother Thomas", email: "j.thomas@ufdsp.com" },
    { id: "admin_5", name: "Brother Schneider", email: "z.schneider@ufdsp.com" },
    { id: "admin_6", name: "Brother Haris", email: "s.haris@ufdsp.com" }
];

let timeslots = []; 

// --- 3. INITIALIZATION & REAL-TIME LISTENER ---
document.addEventListener("DOMContentLoaded", () => {
    populateAdminDropdown();
    listenToDatabase();
});

function listenToDatabase() {
    db.collection("timeslots").onSnapshot((querySnapshot) => {
        timeslots = [];
        querySnapshot.forEach((doc) => {
            let slotData = doc.data();
            slotData.id = doc.id; 
            timeslots.push(slotData);
        });
        renderCalendar();
    }, (error) => {
        console.error("Firestore snapshot error:", error);
    });
}

// --- 4. UI / MODAL CONTROLS ---
function openModal(modalId) {
    document.getElementById(modalId).classList.remove("hidden");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
}

function openAdminAuth() {
    document.getElementById("admin-password").value = "";
    openModal("admin-auth-modal");
}

function verifyAdmin() {
    const pwd = document.getElementById("admin-password").value;
    if (pwd === ADMIN_PASSWORD) {
        closeModal("admin-auth-modal");
        openModal("admin-dashboard-modal");
    } else {
        alert("Incorrect password. Access denied.");
    }
}

function populateAdminDropdown() {
    const select = document.getElementById("admin-host");
    select.innerHTML = ""; 
    ADMIN_USERS.forEach(admin => {
        const option = document.createElement("option");
        option.value = admin.id;
        option.text = `${admin.name} (${admin.email})`;
        select.appendChild(option);
    });
}

// --- 5. SLOT GENERATION (DYNAMIC DURATION & BATCH WRITE) ---
function generateTimeslots() {
    const dateStr = document.getElementById("admin-date").value;
    const startTimeStr = document.getElementById("admin-start").value;
    const endTimeStr = document.getElementById("admin-end").value;
    const adminId = document.getElementById("admin-host").value;
    const location = document.getElementById("admin-location").value.trim();
    const durationMin = parseInt(document.getElementById("admin-duration").value, 10) || 15;

    if (!dateStr || !startTimeStr || !endTimeStr || !location) {
        alert("Please fill out all fields, including the date and location.");
        return;
    }

    const selectedAdmin = ADMIN_USERS.find(a => a.id === adminId);
    if (!selectedAdmin) {
        alert("Invalid admin selected.");
        return;
    }

    const [year, month, day] = dateStr.split('-').map(Number);
    const [startHour, startMin] = startTimeStr.split(':').map(Number);
    const [endHour, endMin] = endTimeStr.split(':').map(Number);

    const startDateObj = new Date(year, month - 1, day, startHour, startMin);
    const endDateObj = new Date(year, month - 1, day, endHour, endMin);

    if (startDateObj >= endDateObj) {
        alert("End time must be after start time.");
        return;
    }

    const formattedDate = startDateObj.toLocaleDateString('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    });

    let currentMs = startDateObj.getTime();
    const endMs = endDateObj.getTime();
    const stepMs = durationMin * 60000;
    let generatedCount = 0;

    const batch = db.batch();

    while (currentMs < endMs) {
        const nextMs = currentMs + stepMs;
        if (nextMs > endMs) break;

        const slotStart = new Date(currentMs);
        const slotEnd = new Date(nextMs);

        const newRef = db.collection("timeslots").doc();
        batch.set(newRef, {
            date: formattedDate,
            startTime: formatTime(slotStart),
            endTime: formatTime(slotEnd),
            startTimestamp: currentMs, 
            endTimestamp: nextMs,
            durationMin: durationMin,
            hostName: selectedAdmin.name,
            adminEmail: selectedAdmin.email,
            location: location,
            isBooked: false
        });

        currentMs = nextMs;
        generatedCount++;
    }

    batch.commit().then(() => {
        alert(`Successfully generated ${generatedCount} (${durationMin}-min) time slots.`);
        closeModal("admin-dashboard-modal");
    }).catch((error) => {
        console.error("Error committing slot batch:", error);
        alert("Failed to generate slots. Check database permissions.");
    });
}

function formatTime(dateObj) {
    return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// --- 6. CALENDAR RENDERING ---
function renderCalendar() {
    const grid = document.getElementById("calendar-grid");
    grid.innerHTML = ""; 

    const currentTime = Date.now();

    const availableSlots = timeslots.filter(slot => {
        const isFuture = (slot.startTimestamp || 0) > currentTime;
        return !slot.isBooked && isFuture;
    });

    availableSlots.sort((a, b) => a.startTimestamp - b.startTimestamp);

    if (availableSlots.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-gray-500 italic text-center py-8">No available timeslots currently. Check back later.</p>`;
        return;
    }

    availableSlots.forEach(slot => {
        const card = document.createElement("div");
        card.className = "bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow p-5 cursor-pointer border-l-4 border-l-dsp-gold flex flex-col justify-between";
        card.onclick = () => initBooking(slot.id);

        card.innerHTML = `
            <div>
                <div class="text-sm font-bold text-gray-500 uppercase tracking-wide mb-1">📅 ${slot.date}</div>
                <div class="text-lg font-bold text-dsp-purple mb-3">🕒 ${slot.startTime} - ${slot.endTime}</div>
                <div class="text-sm text-gray-700 mb-1"><strong>Host:</strong> ${slot.hostName}</div>
                <div class="text-sm text-gray-700"><strong>Room:</strong> ${slot.location}</div>
            </div>
            <div class="mt-4 text-sm text-dsp-gold font-semibold tracking-wide uppercase hover:underline">Book Slot &rarr;</div>
        `;
        grid.appendChild(card);
    });
}

// --- 7. ATOMIC BOOKING LOGIC ---
function initBooking(slotId) {
    const slot = timeslots.find(s => s.id === slotId);
    if (!slot) return;

    document.getElementById("book-name").value = "";
    document.getElementById("book-topic").value = "";
    document.getElementById("book-info").value = "";

    document.getElementById("book-slot-id").value = slot.id;
    document.getElementById("modal-slot-info").innerText = `Booking with ${slot.hostName} on ${slot.date} at ${slot.startTime}`;

    openModal("booking-modal");
}

function confirmMeeting() {
    const slotId = document.getElementById("book-slot-id").value;
    const name = document.getElementById("book-name").value.trim();
    const topic = document.getElementById("book-topic").value;
    const info = document.getElementById("book-info").value.trim();

    if (!name || !topic) {
        alert("Name and Meeting Topic are required.");
        return;
    }

    const confirmBtn = document.getElementById("confirm-btn");
    confirmBtn.innerText = "Booking...";
    confirmBtn.disabled = true;

    const slotRef = db.collection("timeslots").doc(slotId);

    db.runTransaction(async (transaction) => {
        const slotDoc = await transaction.get(slotRef);
        if (!slotDoc.exists) {
            throw new Error("This slot no longer exists.");
        }

        const slotData = slotDoc.data();
        if (slotData.isBooked || slotData.startTimestamp <= Date.now()) {
            throw new Error("Sorry, this slot is no longer available.");
        }

        transaction.update(slotRef, {
            isBooked: true,
            studentName: name,
            studentTopic: topic,
            studentNotes: info
        });

        return { id: slotDoc.id, ...slotData };
    }).then((slot) => {
        triggerAutomatedEmail(slot, { name, topic, info });

        const slotDurationMs = slot.endTimestamp
            ? (slot.endTimestamp - slot.startTimestamp)
            : ((slot.durationMin || 15) * 60000);

        const startObj = new Date(slot.startTimestamp);
        const endObj = new Date(slot.startTimestamp + slotDurationMs);

        const eventTitle = encodeURIComponent(`${topic} with ${slot.hostName}`);
        const eventLocation = encodeURIComponent(slot.location);
        const eventDetails = encodeURIComponent(
            `DSP Office Hours meeting regarding ${topic}.\nNotes: ${info || 'None'}`
        );

        // Format local date/time for Google Calendar.
        // Google Calendar is explicitly told to interpret these times
        // using the America/New_York timezone.
        const formatGoogleDate = (date) => {
            const pad = (num) => String(num).padStart(2, '0');

            return (
                date.getFullYear() +
                pad(date.getMonth() + 1) +
                pad(date.getDate()) +
                'T' +
                pad(date.getHours()) +
                pad(date.getMinutes()) +
                pad(date.getSeconds())
            );
        };

        // 1. Apple/Default (.ics file)
        const icsLink = generateICS(slot, topic);
        const appleBtn = document.getElementById('apple-calendar-btn');
        appleBtn.href = icsLink;
        appleBtn.download = `DSP_Office_Hours_${slot.hostName.replace(/\s+/g, '_')}.ics`;

        // 2. Google Calendar Link
        const googleUrl =
            `https://calendar.google.com/calendar/render?action=TEMPLATE` +
            `&text=${eventTitle}` +
            `&dates=${formatGoogleDate(startObj)}/${formatGoogleDate(endObj)}` +
            `&details=${eventDetails}` +
            `&location=${eventLocation}` +
            `&ctz=America%2FNew_York`;

        document.getElementById('google-calendar-btn').href = googleUrl;

        // 3. Outlook Web Link
        const startIso = encodeURIComponent(startObj.toISOString());
        const endIso = encodeURIComponent(endObj.toISOString());

        const outlookUrl =
            `https://outlook.office.com/calendar/0/deeplink/compose?` +
            `path=/calendar/action/compose` +
            `&rru=addevent` +
            `&subject=${eventTitle}` +
            `&startdt=${startIso}` +
            `&enddt=${endIso}` +
            `&body=${eventDetails}` +
            `&location=${eventLocation}`;

        document.getElementById('outlook-calendar-btn').href = outlookUrl;

        document.getElementById('success-details').innerHTML = `
            <p class="mb-1"><strong>Host:</strong> ${slot.hostName}</p>
            <p class="mb-1"><strong>Date:</strong> ${slot.date}</p>
            <p class="mb-1"><strong>Time:</strong> ${slot.startTime} - ${slot.endTime}</p>
            <p><strong>Room:</strong> ${slot.location}</p>
        `;

        closeModal("booking-modal");
        openModal("success-modal");
        resetBtn(confirmBtn);

    }).catch((error) => {
        console.error("Error booking slot:", error);
        alert(error.message || "There was an error saving your booking. Please try again.");
        resetBtn(confirmBtn);
    });
}

function resetBtn(btn) {
    btn.innerText = "Confirm Meeting";
    btn.disabled = false;
}

// --- 8. EMAILJS NOTIFICATION ---
function triggerAutomatedEmail(slotInfo, studentData) {
    const templateParams = {
        to_email: slotInfo.adminEmail, 
        host_name: slotInfo.hostName,
        student_name: studentData.name,
        topic: studentData.topic,
        date: slotInfo.date,
        time: `${slotInfo.startTime} - ${slotInfo.endTime}`,
        location: slotInfo.location,
        notes: studentData.info || "None provided"
    };

    const serviceID = "service_txc2r2t";
    const templateID = "template_dpi2ic9";

    emailjs.send(serviceID, templateID, templateParams)
        .then((response) => {
            console.log("Email sent successfully:", response.status, response.text);
        }, (error) => {
            console.error("Failed to send email notification:", error);
        });
}

// --- 9. CALENDAR GENERATOR (.ics) ---
function generateICS(slot, topic) {
    const slotDurationMs = slot.endTimestamp
        ? (slot.endTimestamp - slot.startTimestamp)
        : ((slot.durationMin || 15) * 60000);

    const start = new Date(slot.startTimestamp);
    const end = new Date(slot.startTimestamp + slotDurationMs);

    const formatDate = (date) => date.toISOString().replace(/-|:|\.\d+/g, '');

    const icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DSP Office Hours//EN",
        "BEGIN:VEVENT",
        `UID:${slot.id}@dsp.com`,
        `DTSTAMP:${formatDate(new Date())}`,
        `DTSTART:${formatDate(start)}`,
        `DTEND:${formatDate(end)}`,
        `SUMMARY:${topic} with ${slot.hostName}`,
        `LOCATION:${slot.location}`,
        `DESCRIPTION:DSP Office Hours meeting regarding ${topic}.`,
        "END:VEVENT",
        "END:VCALENDAR"
    ].join('\n');

    const blob = new Blob([icsContent], {
        type: 'text/calendar;charset=utf-8'
    });

    return URL.createObjectURL(blob);
}
