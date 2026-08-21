import {
  Body,
  Controller,
  Delete,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentCustomerId } from '../../common/decorators/current-customer.decorator';
import { paginate, PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  CreateDocumentDto,
  CreateNomineeDto,
  UpdateCustomerProfileDto,
  UpsertBankDetailsDto,
} from '../customers/customers.dto';
import { MeService } from './me.service';

/**
 * Customer self-service. Every route is scoped to the caller's own id via
 * @CurrentCustomerId — there are no customer-id path params here, so a customer
 * can never address another customer's data.
 */
@ApiTags('me (customer self-service)')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Home dashboard (profile, balances, recent activity)' })
  dashboard(@CurrentCustomerId() customerId: string) {
    return this.me.dashboard(customerId);
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  @Get('profile')
  @ApiOperation({ summary: 'Full profile (accounts, nominees, documents, bank)' })
  profile(@CurrentCustomerId() customerId: string) {
    return this.me.profile(customerId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update own name / address / photo' })
  updateProfile(
    @CurrentCustomerId() customerId: string,
    @Body() dto: UpdateCustomerProfileDto,
    @Ip() ip: string,
  ) {
    return this.me.updateProfile(customerId, dto, ip);
  }

  // ── Accounts + ledger ────────────────────────────────────────────────────────
  @Get('accounts')
  @ApiOperation({ summary: 'My pigmy accounts' })
  accounts(@CurrentCustomerId() customerId: string) {
    return this.me.accounts(customerId);
  }

  @Get('accounts/:id/ledger')
  @ApiOperation({ summary: 'Ledger (passbook) for one of my accounts' })
  async ledger(
    @CurrentCustomerId() customerId: string,
    @Param('id', ParseUUIDPipe) accountId: string,
    @Query() q: PaginationQueryDto,
  ) {
    const { rows, total } = await this.me.accountLedger(customerId, accountId, q.page, q.limit);
    return paginate(rows, total, q.page, q.limit);
  }

  // ── Nominees ───────────────────────────────────────────────────────────────
  @Get('nominees')
  @ApiOperation({ summary: 'List my nominees' })
  nominees(@CurrentCustomerId() customerId: string) {
    return this.me.listNominees(customerId);
  }

  @Post('nominees')
  @ApiOperation({ summary: 'Add a nominee' })
  addNominee(
    @CurrentCustomerId() customerId: string,
    @Body() dto: CreateNomineeDto,
    @Ip() ip: string,
  ) {
    return this.me.addNominee(customerId, dto, ip);
  }

  @Delete('nominees/:id')
  @ApiOperation({ summary: 'Remove a nominee' })
  deleteNominee(
    @CurrentCustomerId() customerId: string,
    @Param('id', ParseUUIDPipe) nomineeId: string,
    @Ip() ip: string,
  ) {
    return this.me.deleteNominee(customerId, nomineeId, ip);
  }

  // ── Documents (KYC) ──────────────────────────────────────────────────────────
  @Get('documents')
  @ApiOperation({ summary: 'List my KYC documents' })
  documents(@CurrentCustomerId() customerId: string) {
    return this.me.listDocuments(customerId);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Upload a KYC document (reference to a stored file)' })
  addDocument(
    @CurrentCustomerId() customerId: string,
    @Body() dto: CreateDocumentDto,
    @Ip() ip: string,
  ) {
    return this.me.addDocument(customerId, dto, ip);
  }

  // ── Bank details ─────────────────────────────────────────────────────────────
  @Get('bank-details')
  @ApiOperation({ summary: 'My linked bank account' })
  bankDetails(@CurrentCustomerId() customerId: string) {
    return this.me.getBankDetails(customerId);
  }

  @Put('bank-details')
  @ApiOperation({ summary: 'Add / update my bank account' })
  upsertBankDetails(
    @CurrentCustomerId() customerId: string,
    @Body() dto: UpsertBankDetailsDto,
    @Ip() ip: string,
  ) {
    return this.me.upsertBankDetails(customerId, dto, ip);
  }
}
