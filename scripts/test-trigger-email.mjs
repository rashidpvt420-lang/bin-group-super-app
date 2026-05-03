import admin from 'firebase-admin';
import chalk from 'chalk';

// Initialize Admin SDK
// Assumes local environment has access via firebase login / gcloud login
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'bin-group-57c60'
    });
}

const db = admin.firestore();

async function testEmail() {
  console.log(chalk.blue('🚀 Starting BIN GROUP Transactional Email System Verification...'));
  console.log(chalk.gray('Note: This test uses the /mail collection schema monitored by the Firebase Trigger Email extension.'));
  
  const testPayload = {
    to: "rashidpvt420@gmail.com",
    message: {
      subject: "BIN GROUP SMTP Verification Test",
      text: "This is a verification test for the newly configured transactional SMTP provider.",
      html: "<h2>BIN GROUP SMTP System Test</h2><p>This email confirms that the transactional SMTP relay is operational.</p>"
    },
    metadata: {
        type: "test_verification",
        timestamp: new Date().toISOString()
    }
  };

  try {
    const docRef = await db.collection('mail').add(testPayload);
    console.log(chalk.green(`✅ Fresh test document created: /mail/${docRef.id}`));
    console.log(chalk.yellow('⏳ Polling for delivery status (this may take 10-60 seconds)...'));

    const start = Date.now();
    const timeout = 90000;
    const pollInterval = 5000;

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        const docSnap = await docRef.get();
        const data = docSnap.data();

        if (Date.now() - start > timeout) {
          clearInterval(interval);
          console.log(chalk.red('\n❌ TIMEOUT: The extension did not update the delivery state. Check extension logs.'));
          resolve(false);
        }

        if (data?.delivery) {
          const { state, error, info } = data.delivery;
          
          if (state === 'SUCCESS') {
            clearInterval(interval);
            console.log(chalk.green('\n✨ SUCCESS: Email relay is functional!'));
            console.log(chalk.cyan(`Status: ${state}`));
            console.log(chalk.gray(`Info: ${JSON.stringify(info)}`));
            resolve(true);
          } else if (state === 'ERROR') {
            clearInterval(interval);
            console.log(chalk.red('\n🔥 ERROR: Email delivery failed.'));
            console.log(chalk.red(`Reason: ${error}`));
            console.log(chalk.yellow('\nACTION REQUIRED: Update extension SMTP configuration to SendGrid or Brevo.'));
            resolve(false);
          } else {
            console.log(chalk.cyan(`Current State: ${state}...`));
          }
        } else {
            console.log(chalk.gray('Waiting for extension to pick up document...'));
        }
      }, pollInterval);
    });

  } catch (err) {
    console.error(chalk.red('💥 Error writing to Firestore:'), err);
    process.exit(1);
  }
}

testEmail().then((success) => {
  process.exit(success ? 0 : 1);
});
