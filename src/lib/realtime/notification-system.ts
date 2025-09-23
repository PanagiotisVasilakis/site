/**
 * Real-time Notification System
 * WebSocket-based real-time updates for booking status, check-in, etc.
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { verifyGuestSession } from '@/lib/guestSession';

interface NotificationEvent {
  type: 'booking_confirmed' | 'booking_updated' | 'checkin_ready' | 'checkin_completed' | 'system_message';
  userId?: string;
  bookingId?: string;
  data: any;
  timestamp: number;
}

interface ConnectedClient {
  id: string;
  userId?: string;
  bookingId?: string;
  joinedAt: number;
  lastActivity: number;
  rooms: Set<string>;
}

export class RealTimeNotificationSystem {
  private io: SocketIOServer;
  private clients = new Map<string, ConnectedClient>();
  private userSockets = new Map<string, Set<string>>(); // userId -> socketIds
  private bookingSockets = new Map<string, Set<string>>(); // bookingId -> socketIds

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
    this.startCleanupInterval();

    logger.info('Real-time notification system initialized');
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  private async handleConnection(socket: Socket): Promise<void> {
    const clientId = socket.id;
    logger.info('Client connected', { clientId });
    metrics.counter('realtime_connections_total', 1, { type: 'connect' });

    // Authenticate client
    const authResult = await this.authenticateClient(socket);
    if (!authResult.success) {
      logger.warn('Client authentication failed', { clientId, reason: authResult.error });
      socket.emit('auth_error', { message: 'Authentication failed' });
      socket.disconnect();
      return;
    }

    // Register client
    const client: ConnectedClient = {
      id: clientId,
      userId: authResult.userId,
      bookingId: authResult.bookingId,
      joinedAt: Date.now(),
      lastActivity: Date.now(),
      rooms: new Set(),
    };

    this.clients.set(clientId, client);

    // Track user connections
    if (client.userId) {
      const userSockets = this.userSockets.get(client.userId) || new Set();
      userSockets.add(clientId);
      this.userSockets.set(client.userId, userSockets);
    }

    // Track booking connections
    if (client.bookingId) {
      const bookingSockets = this.bookingSockets.get(client.bookingId) || new Set();
      bookingSockets.add(clientId);
      this.bookingSockets.set(client.bookingId, bookingSockets);
    }

    // Setup socket event handlers
    this.setupSocketHandlers(socket, client);

    // Send welcome message
    socket.emit('connected', {
      clientId,
      userId: client.userId,
      bookingId: client.bookingId,
      timestamp: Date.now(),
    });

    // Join appropriate rooms
    await this.joinRooms(socket, client);
  }

  private async authenticateClient(socket: Socket): Promise<{ success: boolean; userId?: string; bookingId?: string; error?: string }> {
    try {
      // Get session from cookies or authorization header
      const cookies = socket.handshake.headers.cookie;
      const authHeader = socket.handshake.auth?.token;

      if (!cookies && !authHeader) {
        return { success: false, error: 'No authentication provided' };
      }

      // Parse session (simplified - would use your actual session verification)
      const sessionToken = this.extractSessionToken(cookies || authHeader);
      if (!sessionToken) {
        return { success: false, error: 'Invalid session token' };
      }

      // Verify session using your existing session system
      const session = await verifyGuestSession(sessionToken);
      if (!session) {
        return { success: false, error: 'Session verification failed' };
      }

      return {
        success: true,
        userId: session.user?.id,
        bookingId: session.booking?.id,
      };
    } catch (error) {
      logger.error('Client authentication error', { error });
      return { success: false, error: 'Authentication error' };
    }
  }

  private setupSocketHandlers(socket: Socket, client: ConnectedClient): void {
    // Heartbeat
    socket.on('ping', () => {
      client.lastActivity = Date.now();
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Join/leave rooms
    socket.on('join_room', async (roomName: string) => {
      await this.joinRoom(socket, client, roomName);
    });

    socket.on('leave_room', async (roomName: string) => {
      await this.leaveRoom(socket, client, roomName);
    });

    // Subscribe to booking updates
    socket.on('subscribe_booking', async (bookingId: string) => {
      if (client.bookingId === bookingId) {
        await this.joinRoom(socket, client, `booking:${bookingId}`);
      }
    });

    // Request current status
    socket.on('get_status', async () => {
      const status = await this.getClientStatus(client);
      socket.emit('status_update', status);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(client.id, reason);
    });

    // Error handling
    socket.on('error', (error) => {
      logger.error('Socket error', { clientId: client.id, error });
      metrics.counter('realtime_errors_total', 1, { type: 'socket_error' });
    });
  }

  private async joinRooms(socket: Socket, client: ConnectedClient): Promise<void> {
    // Auto-join user-specific room
    if (client.userId) {
      await this.joinRoom(socket, client, `user:${client.userId}`);
    }

    // Auto-join booking-specific room
    if (client.bookingId) {
      await this.joinRoom(socket, client, `booking:${client.bookingId}`);
    }

    // Join general notifications room
    await this.joinRoom(socket, client, 'general');
  }

  private async joinRoom(socket: Socket, client: ConnectedClient, roomName: string): Promise<void> {
    socket.join(roomName);
    client.rooms.add(roomName);
    
    logger.info('Client joined room', { 
      clientId: client.id, 
      userId: client.userId, 
      roomName 
    });

    metrics.counter('realtime_room_joins_total', 1, { room: roomName });

    socket.emit('room_joined', { roomName, timestamp: Date.now() });
  }

  private async leaveRoom(socket: Socket, client: ConnectedClient, roomName: string): Promise<void> {
    socket.leave(roomName);
    client.rooms.delete(roomName);
    
    logger.info('Client left room', { 
      clientId: client.id, 
      userId: client.userId, 
      roomName 
    });

    socket.emit('room_left', { roomName, timestamp: Date.now() });
  }

  private handleDisconnection(clientId: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    logger.info('Client disconnected', { clientId, userId: client.userId, reason });
    metrics.counter('realtime_connections_total', 1, { type: 'disconnect' });

    // Remove from tracking maps
    if (client.userId) {
      const userSockets = this.userSockets.get(client.userId);
      if (userSockets) {
        userSockets.delete(clientId);
        if (userSockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
    }

    if (client.bookingId) {
      const bookingSockets = this.bookingSockets.get(client.bookingId);
      if (bookingSockets) {
        bookingSockets.delete(clientId);
        if (bookingSockets.size === 0) {
          this.bookingSockets.delete(client.bookingId);
        }
      }
    }

    this.clients.delete(clientId);
  }

  // Public API for sending notifications
  public async sendNotification(event: NotificationEvent): Promise<void> {
    logger.info('Sending notification', { 
      type: event.type, 
      userId: event.userId, 
      bookingId: event.bookingId 
    });

    metrics.counter('realtime_notifications_sent', 1, { type: event.type });

    // Send to specific user
    if (event.userId) {
      await this.sendToUser(event.userId, 'notification', event);
    }

    // Send to specific booking
    if (event.bookingId) {
      await this.sendToBooking(event.bookingId, 'notification', event);
    }

    // Send to general room for system messages
    if (event.type === 'system_message') {
      this.io.to('general').emit('notification', event);
    }
  }

  public async sendToUser(userId: string, eventName: string, data: any): Promise<void> {
    const userSockets = this.userSockets.get(userId);
    if (!userSockets || userSockets.size === 0) {
      logger.debug('No active connections for user', { userId });
      return;
    }

    for (const socketId of userSockets) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(eventName, data);
      }
    }

    metrics.counter('realtime_user_messages_sent', 1, { userId });
  }

  public async sendToBooking(bookingId: string, eventName: string, data: any): Promise<void> {
    this.io.to(`booking:${bookingId}`).emit(eventName, data);
    metrics.counter('realtime_booking_messages_sent', 1, { bookingId });
  }

  public async broadcast(eventName: string, data: any): Promise<void> {
    this.io.emit(eventName, data);
    metrics.counter('realtime_broadcasts_sent', 1, { event: eventName });
  }

  // Status and monitoring
  public getConnectedClients(): { total: number; byUser: Record<string, number>; byBooking: Record<string, number> } {
    const byUser: Record<string, number> = {};
    const byBooking: Record<string, number> = {};

    for (const client of this.clients.values()) {
      if (client.userId) {
        byUser[client.userId] = (byUser[client.userId] || 0) + 1;
      }
      if (client.bookingId) {
        byBooking[client.bookingId] = (byBooking[client.bookingId] || 0) + 1;
      }
    }

    return {
      total: this.clients.size,
      byUser,
      byBooking,
    };
  }

  private async getClientStatus(client: ConnectedClient): Promise<any> {
    return {
      clientId: client.id,
      userId: client.userId,
      bookingId: client.bookingId,
      rooms: Array.from(client.rooms),
      connectedAt: client.joinedAt,
      lastActivity: client.lastActivity,
      timestamp: Date.now(),
    };
  }

  private extractSessionToken(authData: string): string | null {
    // Extract session token from cookies or auth header
    if (authData.includes('guest_session=')) {
      const match = authData.match(/guest_session=([^;]+)/);
      return match ? match[1] : null;
    }
    
    // From Bearer token
    if (authData.startsWith('Bearer ')) {
      return authData.substring(7);
    }

    return null;
  }

  private startCleanupInterval(): void {
    // Cleanup inactive connections every 5 minutes
    setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000);
  }

  private cleanupInactiveConnections(): void {
    const now = Date.now();
    const inactiveThreshold = 10 * 60 * 1000; // 10 minutes

    let cleanedCount = 0;
    for (const [clientId, client] of this.clients.entries()) {
      if (now - client.lastActivity > inactiveThreshold) {
        const socket = this.io.sockets.sockets.get(clientId);
        if (socket) {
          socket.disconnect();
        }
        this.handleDisconnection(clientId, 'inactive_cleanup');
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Cleaned up inactive connections', { count: cleanedCount });
      metrics.counter('realtime_connections_cleaned', cleanedCount);
    }
  }
}

// Notification helper functions
export async function notifyBookingConfirmed(bookingId: string, userId: string, bookingData: any): Promise<void> {
  const notification: NotificationEvent = {
    type: 'booking_confirmed',
    userId,
    bookingId,
    data: bookingData,
    timestamp: Date.now(),
  };

  await getRealTimeSystem().sendNotification(notification);
}

export async function notifyCheckinReady(bookingId: string, userId: string): Promise<void> {
  const notification: NotificationEvent = {
    type: 'checkin_ready',
    userId,
    bookingId,
    data: { message: 'Your check-in is ready!' },
    timestamp: Date.now(),
  };

  await getRealTimeSystem().sendNotification(notification);
}

export async function notifyCheckinCompleted(bookingId: string, userId: string, checkinData: any): Promise<void> {
  const notification: NotificationEvent = {
    type: 'checkin_completed',
    userId,
    bookingId,
    data: checkinData,
    timestamp: Date.now(),
  };

  await getRealTimeSystem().sendNotification(notification);
}

export async function sendSystemMessage(message: string, severity: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
  const notification: NotificationEvent = {
    type: 'system_message',
    data: { message, severity },
    timestamp: Date.now(),
  };

  await getRealTimeSystem().sendNotification(notification);
}

// Singleton instance
let realTimeSystemInstance: RealTimeNotificationSystem | null = null;

export function initializeRealTimeSystem(server: HTTPServer): RealTimeNotificationSystem {
  if (!realTimeSystemInstance) {
    realTimeSystemInstance = new RealTimeNotificationSystem(server);
  }
  return realTimeSystemInstance;
}

export function getRealTimeSystem(): RealTimeNotificationSystem {
  if (!realTimeSystemInstance) {
    throw new Error('Real-time system not initialized. Call initializeRealTimeSystem first.');
  }
  return realTimeSystemInstance;
}