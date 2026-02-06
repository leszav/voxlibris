import dotenv from "dotenv";

dotenv.config();

async function seed() {
	try {
		console.log("🌱 Database seeding completed - all data is in migrations/seed_data.sql");
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	await seed();
}

export { seed };
