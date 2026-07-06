/** * MAIN CONFIGURATION */

// 1. INVENTORY SETUP
// Add items here that you have MORE than one of.
// Any item NOT in this list will automatically be treated as having a limit of 1.
const INVENTORY = {
  "Test Item A": 2
};

const CALENDAR_ID = 'a985d0e1c6fe6702c651df34087518c6b6b2dc3774179f8dba16425c0a859dcb@group.calendar.google.com';
const adminEmail = 'trevorluttrell1492@hotmail.com';

function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    console.log('Could not obtain lock after 30 seconds.');
    return;
  }

  // --- TEST TOGGLE ---
  const values = e ? e.values : [
    "4/14/2026 14:00:00", // [0] Timestamp
    "Student Name",        // [1] Name (Placeholder)
    "student@example.edu", // [2] Email
    "Other info",          // [3]
    "4/20/2026",           // [4] Pickup Date
    "4/23/2026",           // [5] Return Date
    "Sony A7III Camera",   // [6] Item Col 1
    "Tripod - 60 inch",    // [7] Item Col 2
    "", "",                // [8, 9]
    "Sandbag",             // [10] Item Col 3
    "", "",                // [11, 12]
    "SD Card 64GB"         // [13] Item Col 4
  ];

  const studentEmail = values[1];
  const pickupDate = new Date(values[3]);
  const returnDate = new Date(values[4]);
  const now = new Date();

  // 2. BASIC VALIDATION
  if (returnDate <= pickupDate) {
    rejectRequest(studentEmail, "Invalid Dates", "Your return date must be AFTER your pickup date.");
    lock.releaseLock();
    return;
  }

  const day = pickupDate.getDay();
  const allowedDays = [1, 2, 4, 5]; // Mon, Tue, Thu, Fri

  if (!allowedDays.includes(day)) {
    rejectRequest(studentEmail, "Check Office Hours", "Pickup is only available Mon, Tue, Thu, Fri.");
    lock.releaseLock();
    return;
  }

  // Set the 4pm-6pm window
  pickupDate.setHours(11, 0, 0);
  returnDate.setHours(13, 0, 0);

  // 3. FLATTEN ITEMS
  let allSelectedItems = [];
  [2, 5, 6].forEach(index => {
    if (values[index]) {
      const itemsInCol = values[index].split(',').map(item => item.trim());
      allSelectedItems = allSelectedItems.concat(itemsInCol);
    }
  });
  allSelectedItems = allSelectedItems.filter(item => item !== "");

  // 4. 24-HOUR RULE
  const msIn24Hours = 24 * 60 * 60 * 1000;
  if (pickupDate - now < msIn24Hours) {
    rejectRequest(studentEmail, allSelectedItems.join(", "), "Requests must be made at least 24 hours in advance.");
    lock.releaseLock();
    return;
  }

  // 5. INVENTORY-AWARE CONFLICT CHECK
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  const conflicts = calendar.getEvents(pickupDate, returnDate);

  let approvedItems = [];
  let rejectedItems = [];

  allSelectedItems.forEach(item => {
    // Determine the max allowed for this specific item
    const maxAllowed = INVENTORY[item] || 1;

    // Build the regex for exact word matching (Fixes B vs BC)
    const escapedItem = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp("\\b" + escapedItem + "\\b", "i");

    // Count how many of this item are currently booked on the calendar
    let currentBookedCount = 0;
    conflicts.forEach(event => {
      if (regex.test(event.getTitle())) {
        currentBookedCount++;
      }
    });

    // Approval logic
    if (currentBookedCount < maxAllowed) {
      approvedItems.push(item);
    } else {
      rejectedItems.push(item);
    }
  });

  // 6. ACTION: CREATE EVENT & NOTIFY
  if (approvedItems.length > 0) {
    const approvedListString = approvedItems.join(", ");
    calendar.createEvent(`OUT: ${approvedListString} (${studentEmail})`, pickupDate, returnDate, {
      description: `Student: ${studentEmail}\nApproved Items: ${approvedListString}\nStatus: Confirmed`,
      guests: studentEmail,
      sendInvites: true
    });

    const successBody = `Your equipment request has been confirmed:\n\nItems: ${approvedListString}\nPickup: ${pickupDate.toDateString()} @ 4:00 PM\nReturn: ${returnDate.toDateString()} @ 6:00 PM`;
    MailApp.sendEmail({ to: studentEmail, subject: `APPROVED: Equipment Request`, body: successBody });
    MailApp.sendEmail({ to: adminEmail, subject: `ADMIN ALERT: Approved (${studentEmail})`, body: successBody });
  }

  if (rejectedItems.length > 0) {
    const rejectedListString = rejectedItems.join(", ");
    rejectRequest(studentEmail, rejectedListString, "Items are fully booked for these dates.");
  }

  lock.releaseLock();
}

function rejectRequest(email, item, reason) {
  const body = `Sorry, your request for the following items was declined:\n${item}\n\nReason: ${reason}`;
  MailApp.sendEmail({ to: email, subject: `DECLINED: Equipment Request`, body: body });
  MailApp.sendEmail({ to: adminEmail, subject: `ADMIN ALERT: Declined (${email})`, body: body });
}
