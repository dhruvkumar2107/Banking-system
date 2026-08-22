import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomerId } from '../../common/decorators/current-customer.decorator';
import { SubmitKycDto } from './kyc.dto';
import { KycService } from './kyc.service';

/**
 * Customer-facing KYC. Deliberately NOT behind @RequiresKyc — this is the way
 * out of the gate, so it has to stay reachable while KYC is incomplete.
 *
 * Keyed to the caller via @CurrentCustomerId; there is no customer-id param, so
 * one customer can never submit or read another's KYC.
 */
@ApiTags('kyc (customer)')
@ApiBearerAuth()
@Controller('me/kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  @ApiOperation({
    summary: 'My KYC status, what is on file, and what is still needed',
  })
  status(@CurrentCustomerId() customerId: string) {
    return this.kyc.status(customerId);
  }

  @Post()
  @ApiOperation({
    summary: 'Submit KYC: live/uploaded photo + Aadhaar card + Aadhaar number + nominee(s)',
    description:
      'Upload the two images via POST /uploads first, then send their URLs here. ' +
      'Only the last 4 digits of the Aadhaar number and a salted hash are stored. ' +
      'Everything is written in one transaction, and the submission goes to an admin for review.',
  })
  submit(
    @CurrentCustomerId() customerId: string,
    @Body() dto: SubmitKycDto,
    @Ip() ip: string,
  ) {
    return this.kyc.submit(customerId, dto, ip);
  }
}
