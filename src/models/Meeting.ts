import mongoose, { Schema, Document } from 'mongoose';

export interface IMeeting extends Document {
  meetingId: string;
  externalMeetingId?: string;
  citaId?: mongoose.Types.ObjectId;
  meetingData: Record<string, unknown>;
  status: 'created' | 'active' | 'ended' | 'expired';
  pipelineId?: string;
  /** SinkArn devuelto por Chime al crear el pipeline (para construir la ruta real en S3) */
  recordingSinkArn?: string;
  transcriptionEnabled?: boolean;
  grabacionUrl?: string;
  duracionMinutos?: number;
  attendees: Array<Record<string, unknown> & { joinedAt?: Date }>;
  isGuided?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    meetingId: { type: String, required: true, unique: true },
    externalMeetingId: { type: String, trim: true },
    citaId: { type: Schema.Types.ObjectId, ref: 'Cita' },
    meetingData: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['created', 'active', 'ended', 'expired'],
      default: 'created'
    },
    pipelineId: { type: String, trim: true },
    recordingSinkArn: { type: String, trim: true },
    transcriptionEnabled: { type: Boolean, default: false },
    grabacionUrl: { type: String, trim: true },
    duracionMinutos: { type: Number },
    attendees: { type: [{ type: Schema.Types.Mixed }], default: [] },
    isGuided: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export default mongoose.model<IMeeting>('Meeting', MeetingSchema);
