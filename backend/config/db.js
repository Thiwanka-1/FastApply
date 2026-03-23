import mongoose from 'mongoose';
import dns from "node:dns/promises";

const connectDB = async () => {
  try {
    // Apply the DNS fix ONLY in development mode
    if (process.env.NODE_ENV === 'development') {
      dns.setServers(["1.1.1.1", "8.8.8.8"]);
      console.log('Using custom DNS for local MongoDB connection.');
    }

    // Attempt to connect to the database
    const conn = await mongoose.connect(process.env.MONGO_URI);
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1); 
  }
};

export default connectDB;