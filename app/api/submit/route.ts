import { NextRequest } from 'next/server';\nimport { validateFrameMessage, frameResponse, errorResponse, getSessionData, updateSessionData, ratelimit } from '@/lib/utils';\nimport { vehicleSubmissionSchema } from '@/types';\n\nexport async function POST(req: NextRequest) {\n  try {\n    // Apply rate limiting\n    const ip = req.headers.get('x-forwarded-for') || 'anonymous';\n    const { success: ratelimitSuccess } = await ratelimit.limit(ip);\n    \n    if (!ratelimitSuccess) {\n      return errorResponse('Rate limit exceeded. Please try again later.', 429);\n    }\n\n    // Parse the frame message\n    const body = await req.json();\n    const frameMessage = await validateFrameMessage(body);\n\n    if (!frameMessage) {\n      return errorResponse('Invalid frame message');\n    }\n\n    const { untrustedData } = frameMessage;\n    const { state, buttonIndex, fid } = untrustedData;\n    const frameHost = process.env.FRAME_HOST || 'https://unique-vehicles-frame.vercel.app';\n    const channelName = process.env.CHANNEL_NAME || 'unique-vehicles';\n    \n    // Parse state\n    const stateParams = new URLSearchParams(state?.toString() || '');\n    const sessionId = stateParams.get('sessionId') || '';\n    const sessionData = sessionId ? await getSessionData(sessionId) : null;\n    \n    if (!sessionData || !sessionData.imageUrl || !sessionData.vehicleDetails) {\n      return frameResponse({\n        image: `${frameHost}/api/images/error`,\n        postUrl: `${frameHost}/api/capture-choice`,\n        buttons: ['Start Over'],\n      });\n    }\n\n    // Handle button actions\n    if (buttonIndex === 1) {\n      // User clicked Submit\n      const { description, vehicleType, location } = sessionData.vehicleDetails;\n      \n      // Validate submission data\n      try {\n        vehicleSubmissionSchema.parse({\n          description,\n          vehicleType,\n          location,\n          imageUrl: sessionData.imageUrl,\n        });\n      } catch (error) {\n        console.error('Validation error:', error);\n        return frameResponse({\n          image: `${frameHost}/api/images/error`,\n          postUrl: `${frameHost}/api/vehicle-details`,\n          buttons: ['Fix Details'],\n          state: { sessionId, step: 'details' },\n        });\n      }\n\n      // Update session to mark as successful\n      await updateSessionData(sessionId, { step: 'success' });\n      \n      // In a real implementation, this is where you would:\n      // 1. Generate a post for the Farcaster channel\n      // 2. Use Farcaster's API to post to the channel\n      // 3. Store the submission in a database\n      \n      // For now, we'll just show a success message\n      return frameResponse({\n        image: `${frameHost}/api/images/success?sessionId=${encodeURIComponent(sessionId)}`,\n        postUrl: `${frameHost}/api/capture-choice`,\n        buttons: ['Submit Another', 'Visit Channel'],\n      });\n    } else if (buttonIndex === 2) {\n      // User clicked Edit Details\n      return frameResponse({\n        image: `${frameHost}/api/images/preview?url=${encodeURIComponent(sessionData.imageUrl)}`,\n        postUrl: `${frameHost}/api/vehicle-details`,\n        buttons: ['Continue'],\n        input: { text: 'Edit vehicle description' },\n        state: { sessionId, step: 'details' },\n      });\n    }\n\n    // Default response\n    return frameResponse({\n      image: `${frameHost}/api/images/confirmation?sessionId=${encodeURIComponent(sessionId)}`,\n      postUrl: `${frameHost}/api/submit`,\n      buttons: ['Submit', 'Edit Details'],\n      state: { sessionId },\n    });\n  } catch (error) {\n    console.error('Error in submit endpoint:', error);\n    return errorResponse('An error occurred. Please try again later.', 500);\n  }\n}