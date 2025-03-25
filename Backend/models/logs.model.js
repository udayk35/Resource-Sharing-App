import { Schema, model } from 'mongoose';

const logSchema = new Schema({
  providerID:{type: String,required:true},
  consumerID:{type: String,required:true},
  Image:{type: String,required:true},
  containerID:{type: String,required:true},
},{timestamps:true});

export default model('Logs', userSchema);